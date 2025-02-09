import dayjs = require("dayjs");
import { parentPort } from "worker_threads";
import prisma from "../../init/database";

(async () => {
  const users = await prisma.user.findMany({
    where: {
      AND: [{ lastCommand: { lt: dayjs().subtract(6, "month").toDate() } }, { karma: { lt: 10 } }],
    },
    select: {
      Achievements: true,
      CommandUse: true,
      Economy: true,
      email: true,
      lastfmUsername: true,
      Premium: true,
      Username: true,
      WordleStats: true,
      tracking: true,
      id: true,
    },
  });

  let count = 0;

  for (const user of users) {
    if (
      user.Achievements.some((a) => a.completed) ||
      (user.CommandUse.length == 0 ? false : user.CommandUse.map((c) => c.uses).reduce((a, b) => a + b) > 100) ||
      user.Economy ||
      user.Premium ||
      user.Username.length > 0 ||
      user.WordleStats ||
      user.email ||
      user.lastfmUsername ||
      !user.tracking ||
      (await prisma.mention.findMany({ where: { targetId: user.id }, take: 1 })).length > 0
    )
      continue;

    count++;
    // await prisma.user.delete({ IM NOT CONFIDENT YET
    //   where: {
    //     id: user.id,
    //   },
    // });
  }

  parentPort.postMessage(`${count.toLocaleString()} users purged from database`);

  process.exit(0);
})();
