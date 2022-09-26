import { GuildMember } from "discord.js";
import prisma from "../../database/database";
import redis from "../../database/redis";
import { logger } from "../../logger";
import { NypsiClient } from "../../models/Client";
import { PremUser } from "../../models/PremStorage";
import { formatDate } from "../date";
import requestDM from "../requestdm";
import { colorCache } from "./color";

export async function isPremium(member: GuildMember | string): Promise<boolean> {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (await redis.exists(`cache:premium:level:${id}`)) {
    const level = parseInt(await redis.get(`cache:premium:level:${id}`));

    if (level == 0) {
      return false;
    } else {
      return true;
    }
  }

  const query = await prisma.premium.findUnique({
    where: {
      userId: id,
    },
    select: {
      userId: true,
      level: true,
    },
  });

  if (query) {
    if (query.level == 0) {
      await prisma.premium.delete({
        where: {
          userId: id,
        },
      });
      await redis.set(`cache:premium:level:${id}`, 0);
      await redis.expire(`cache:premium:level:${id}`, 300);
      return false;
    }

    await redis.set(`cache:premium:level:${id}`, query.level);
    await redis.expire(`cache:premium:level:${id}`, 300);
    return true;
  } else {
    await redis.set(`cache:premium:level:${id}`, 0);
    await redis.expire(`cache:premium:level:${id}`, 300);
    return false;
  }
}

export async function getTier(member: GuildMember | string): Promise<number> {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (await redis.exists(`cache:premium:level:${id}`)) return parseInt(await redis.get(`cache:premium:level:${id}`));

  const query = await prisma.premium.findUnique({
    where: {
      userId: id,
    },
    select: {
      level: true,
    },
  });

  await redis.set(`cache:premium:level:${id}`, query.level || 0);
  await redis.expire(`cache:premium:level:${id}`, 300);

  return query.level;
}

export async function addMember(member: GuildMember | string, level: number, client: NypsiClient) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const start = new Date();
  const expire = new Date();

  expire.setDate(new Date().getDate() + 35);

  await prisma.premium.create({
    data: {
      userId: id,
      level: level,
      startDate: start,
      expireDate: expire,
      lastWeekly: new Date(0),
    },
  });

  const profile = await getPremiumProfile(id);

  logger.info(`premium level ${level} given to ${id}`);

  await requestDM({
    memberId: id,
    client: client,
    content: `you have been given **${profile.getLevelString()}** membership, this will expire on **${formatDate(
      profile.expireDate
    )}**\n\nplease join the support server if you have any problems, or questions. discord.gg/hJTDNST`,
  });

  await redis.del(`cache:premium:level:${id}`);
}

export async function getPremiumProfile(member: GuildMember | string): Promise<PremUser> {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const query = await prisma.premium.findUnique({
    where: {
      userId: id,
    },
  });

  return createPremUser(query);
}

export async function setTier(member: GuildMember | string, level: number, client: NypsiClient) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  await prisma.premium.update({
    where: {
      userId: id,
    },
    data: {
      level: level,
    },
  });

  logger.info(`premium level updated to ${level} for ${id}`);

  await requestDM({
    memberId: id,
    client: client,
    content: `your membership has been updated to **${PremUser.getLevelString(level)}**`,
  });

  await redis.del(`cache:premium:level:${id}`);
}

export async function setStatus(member: GuildMember | string, status: number) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  await prisma.premium.update({
    where: {
      userId: id,
    },
    data: {
      status: status,
    },
  });
}

export async function renewUser(member: string, client: NypsiClient) {
  const profile = await getPremiumProfile(member);

  profile.renew();

  await prisma.premium.update({
    where: {
      userId: member,
    },
    data: {
      expireDate: profile.expireDate,
    },
  });

  await requestDM({
    memberId: member,
    client: client,
    content: `your membership has been renewed until **${formatDate(profile.expireDate)}**`,
  });

  await redis.del(`cache:premium:level:${member}`);

  if (colorCache.has(member)) {
    colorCache.delete(member);
  }
}

export async function expireUser(member: string, client: NypsiClient) {
  const profile = await getPremiumProfile(member);

  const expire = await profile.expire(client);

  if (expire == "boost") {
    return renewUser(member, client);
  }

  await prisma.premium.delete({
    where: {
      userId: member,
    },
  });

  await prisma.premiumCommand
    .delete({
      where: {
        owner: member,
      },
    })
    .catch(() => {
      // doesnt need to find one
    });

  await redis.del(`cache:premium:level:${member}`);

  if (colorCache.has(member)) {
    colorCache.delete(member);
  }
}

export async function setExpireDate(member: GuildMember | string, date: Date, client: NypsiClient) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  await prisma.premium.update({
    where: {
      userId: id,
    },
    data: {
      expireDate: date,
    },
  });

  await requestDM({
    memberId: id,
    client: client,
    content: `your membership will now expire on **${formatDate(date)}**`,
  });
}

export function createPremUser(query: any) {
  return PremUser.fromData({
    id: query.userId,
    level: query.level,
    embedColor: query.embedColor,
    lastDaily: query.lastDaily,
    lastWeekly: query.lastWeekly,
    status: query.status,
    startDate: query.startDate,
    expireDate: query.expireDate,
  });
}