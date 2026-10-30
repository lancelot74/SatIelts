export const SALE_END = Date.parse("2026-11-09T00:00:00+08:00");
export const stacking = true;

const soloList = { week: 7000, month: 20000 };
const friendsList = {
  week: { total: 16800, each: 5600 },
  month: { total: 48000, each: 16000 },
};

export function saleActive(now = Date.now()) {
  return now < SALE_END;
}

export function offer(now = Date.now()) {
  const sale = saleActive(now);
  return {
    sale,
    end: SALE_END,
    stacking,
    solo: {
      week: { list: soloList.week, price: sale ? 3500 : soloList.week },
      month: { list: soloList.month, price: sale ? 10000 : soloList.month },
    },
    friends: {
      week: {
        listTotal: friendsList.week.total,
        listEach: friendsList.week.each,
        total: sale ? 8400 : friendsList.week.total,
        each: sale ? 2800 : friendsList.week.each,
      },
      month: {
        listTotal: friendsList.month.total,
        listEach: friendsList.month.each,
        total: sale ? 24000 : friendsList.month.total,
        each: sale ? 8000 : friendsList.month.each,
      },
    },
  };
}

export function formatTugrik(amount) {
  return `${Number(amount).toLocaleString("en-US")}₮`;
}

export function planCode(plan, group) {
  if (plan !== "week" && plan !== "month") return null;
  return String(group) === "3" ? `${plan}-3` : plan;
}

export function priceFor(plan, group, at = Date.now()) {
  if (plan !== "week" && plan !== "month") return null;
  const friends = String(group) === "3";
  const current = offer(at);
  const row = friends ? current.friends[plan] : current.solo[plan];
  return {
    plan,
    group: friends ? 3 : 1,
    amount: friends ? row.total : row.price,
    list: friends ? row.listTotal : row.list,
    each: friends ? row.each : row.price,
    sale: current.sale,
  };
}
