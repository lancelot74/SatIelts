# Connection budget

The API uses the Supabase transaction pooler (port 6543). Two limits are separate:

- **Client connections** are sockets from this app, previews, and migration clients to Supavisor. The compute size sets the cap. Nano and Micro allow 200 pooler clients. Small allows 400. The cap is on the compute size and is not raised by editing the pool size.
- **Backend connections** are the sockets Supavisor opens to Postgres. That is the dashboard pool size, shared by the shared pooler and the dedicated pooler. It is not `PG_POOL_MAX` multiplied by the number of instances.

`PG_POOL_MAX` is the per-instance client pool. The default is **5**. Idle clients close after 20 seconds.

```
client sockets ≈ warm instances × PG_POOL_MAX + preview instances × PG_POOL_MAX + one migration client
```

A rolling deploy briefly runs the old and new instances together, so count both. Keep that total under about half of the pooler client cap so Auth, previews, and a migration still fit. On Nano or Micro (200 clients), 5 is the default because 15 warm instances use 75 sockets, and a deploy overlap of 30 instances uses 150, which still leaves headroom. If the dashboard shows more warm instances than that, set `PG_POOL_MAX` to 2.

Five is not one Postgres backend per app connection. Supavisor multiplexes those clients onto the backend pool. Raising `PG_POOL_MAX` does not raise that backend pool. Do not set the app pool to 1 to "save" database connections: one Fluid instance serves concurrent requests, and a pool of 1 makes them wait on each other.

The localhost load test measures that local wait. It does not measure pooler latency or a fleet at the client cap.
