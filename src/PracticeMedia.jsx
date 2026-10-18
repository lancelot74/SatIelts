import { useEffect, useRef, useState } from "react";
import { Mic, Square, Volume2, Download } from "lucide-react";

// Recordings stay on this browser. Only typed responses go to the account API.
async function recordingStore(key, blob) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("studyroom-recordings", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("clips");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("clips", blob ? "readwrite" : "readonly");
      const store = tx.objectStore("clips");
      const request = blob ? store.put(blob, key) : store.get(key);
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function PracticeAudio({ text, src, t, disabled }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const supported =
    !src &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window;
  useEffect(
    () => () => {
      if (supported) window.speechSynthesis.cancel();
    },
    [text, supported],
  );
  useEffect(() => {
    if (disabled && supported) {
      window.speechSynthesis.cancel();
      setPlaying(false);
    }
  }, [disabled, supported]);
  function toggle() {
    window.speechSynthesis.cancel();
    if (playing) {
      setPlaying(false);
      return;
    }
    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = "en-US";
    speech.rate = 0.9;
    speech.onend = () => setPlaying(false);
    speech.onerror = (e) => {
      setPlaying(false);
      if (e.error !== "canceled" && e.error !== "interrupted") setFailed(true);
    };
    setFailed(false);
    setPlaying(true);
    window.speechSynthesis.speak(speech);
  }
  if (src) {
    return (
      <div className="practice-audio">
        <audio
          ref={audioRef}
          src={src}
          controls
          preload="none"
          onPlay={(event) => {
            document.querySelectorAll("audio").forEach((clip) => {
              if (clip !== event.currentTarget) clip.pause();
            });
          }}
        />
      </div>
    );
  }
  return (
    <div className="practice-audio">
      {supported && (
        <button
          className="button secondary small"
          onClick={toggle}
          disabled={disabled}
        >
          {playing ? <Square size={15} /> : <Volume2 size={15} />}
          {playing ? t.stopAudio : t.readAloud}
        </button>
      )}
      <small>{failed || !supported ? t.audioUnavailable : t.deviceVoice}</small>
    </div>
  );
}

export function VoiceResponse({ storageKey, t, disabled, readOnly = false }) {
  const [url, setUrl] = useState(null);
  const [recording, setRecording] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef(null),
    alive = useRef(true),
    objectUrl = useRef(null),
    stream = useRef(null),
    enabled = useRef(!disabled && !readOnly);
  enabled.current = !disabled && !readOnly;
  const supported = Boolean(
    navigator.mediaDevices?.getUserMedia && window.MediaRecorder,
  );
  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }
  useEffect(() => {
    alive.current = true;
    let version = 0;
    async function load() {
      const current = ++version;
      try {
        const blob = await recordingStore(storageKey);
        if (!alive.current || current !== version || !blob) return;
        if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = URL.createObjectURL(blob);
        setUrl(objectUrl.current);
      } catch {
        /* The editable recorder reports a persistence error after recording. */
      }
    }
    load();
    const changed = (e) => {
      if (e.detail === storageKey) load();
    };
    window.addEventListener("studyroom-recorded", changed);
    return () => {
      alive.current = false;
      stop();
      stream.current?.getTracks().forEach((track) => track.stop());
      window.removeEventListener("studyroom-recorded", changed);
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, [storageKey]);
  useEffect(() => {
    if (disabled) stop();
  }, [disabled]);
  useEffect(() => {
    if (!recording) return;
    const interval = setInterval(() => setSeconds((n) => n + 1), 1000);
    const limit = setTimeout(stop, 5 * 60000);
    return () => {
      clearInterval(interval);
      clearTimeout(limit);
    };
  }, [recording]);
  async function start() {
    setPending(true);
    setError(null);
    try {
      const input = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current || !enabled.current) {
        input.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = input;
      const media = new MediaRecorder(input);
      recorder.current = media;
      const chunks = [];
      media.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      media.onstop = async () => {
        input.getTracks().forEach((track) => track.stop());
        if (alive.current) setRecording(false);
        const blob = new Blob(chunks, { type: media.mimeType });
        if (!blob.size) return;
        try {
          await recordingStore(storageKey, blob);
          window.dispatchEvent(
            new CustomEvent("studyroom-recorded", { detail: storageKey }),
          );
        } catch {
          if (alive.current) {
            setError(t.recordSaveFailed);
            if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
            objectUrl.current = URL.createObjectURL(blob);
            setUrl(objectUrl.current);
          }
        }
      };
      media.onerror = () => {
        stop();
        if (alive.current) setError(t.recordUnavailable);
      };
      media.start();
      setSeconds(0);
      setRecording(true);
    } catch {
      stream.current?.getTracks().forEach((track) => track.stop());
      if (alive.current) setError(t.recordUnavailable);
    } finally {
      if (alive.current) setPending(false);
    }
  }
  return (
    <div className="voice-response">
      {!readOnly && supported && (
        <button
          className={`button secondary small ${recording ? "recording" : ""}`}
          onClick={recording ? stop : start}
          disabled={disabled || pending}
        >
          {recording ? <Square size={15} /> : <Mic size={15} />}
          {pending
            ? t.loading
            : recording
              ? `${t.stopRecording} · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
              : url
                ? t.recordAgain
                : t.recordAnswer}
        </button>
      )}
      {url && (
        <div className="recording-playback">
          <audio controls src={url} />
          <a
            className="text-link"
            href={url}
            download={`speaking-${storageKey.replaceAll(":", "-")}.webm`}
          >
            <Download size={15} />
            {t.downloadRecording}
          </a>
        </div>
      )}
      <small>
        {!supported && !readOnly ? t.recordUnavailable : t.recordingLocal}
      </small>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
