/**
 * mark_rooms_paid_from_csv.ts
 *
 * Goal:
 * - Read CSV rows that contain: userId + Room IDs (meetingId list)
 * - For each (userId, roomId) pair, update conversations:
 *     paymentStatus = 'paid'
 *     paidAt = now()
 *   Only for rows that are currently unpaid (safe).
 *
 * Usage:
 *   npx tsx mark_rooms_paid_from_csv.ts input.csv
 *   npx tsx mark_rooms_paid_from_csv.ts input.csv --dry-run
 *   npx tsx mark_rooms_paid_from_csv.ts input.csv --only-unpaid
 *
 * Example:
 *   npx tsx mark_rooms_paid_from_csv.ts /mnt/data/e213047e-99b9-4eb2-b23b-9e220a7c7068.csv --only-unpaid
 *
 * Requirements:
 *   npm i @prisma/client csv-parse
 *   npx prisma generate
 */

import fs from "fs";
import { parse } from "csv-parse/sync";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Row = Record<string, any>;

function parseRoomIds(value: any): number[] {
  const raw = String(value ?? "").trim();
  if (!raw) return [];

  // Case: "[3595, 3579]"
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((x) => Number(x)).filter((n) => Number.isFinite(n));
    }
  } catch {
    // ignore
  }

  // Fallback: extract integers from any text
  const nums = raw.match(/\d+/g) ?? [];
  return nums.map((x) => Number(x)).filter((n) => Number.isFinite(n));
}

function parseBoolFlag(flag: string) {
  return process.argv.includes(flag);
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error(
      "Missing input CSV path.\nUsage: npx tsx mark_rooms_paid_from_csv.ts input.csv [--dry-run] [--only-unpaid]"
    );
  }

  const DRY_RUN = parseBoolFlag("--dry-run");
  const ONLY_UNPAID = parseBoolFlag("--only-unpaid");

  const USER_ID_COL = "userId";
  const ROOM_IDS_COL = "Room IDs";

  const csvText = fs.readFileSync(inputPath, "utf8");
  const rows: Row[] = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const pairs = new Map<string, { userId: number; meetingId: number }>();

  for (const r of rows) {
    const userId = Number(r[USER_ID_COL]);
    if (!Number.isFinite(userId)) continue;

    const meetingIds = parseRoomIds(r[ROOM_IDS_COL]);
    for (const meetingId of meetingIds) {
      if (!Number.isFinite(meetingId)) continue;
      const key = `${userId}:${meetingId}`;
      if (!pairs.has(key)) pairs.set(key, { userId, meetingId });
    }
  }

  const pairList = Array.from(pairs.values());
  console.log(
    `Loaded CSV rows: ${rows.length}\nUnique (userId, roomId) pairs: ${pairList.length}\nDRY_RUN=${DRY_RUN}\nONLY_UNPAID=${ONLY_UNPAID}`
  );

  if (pairList.length === 0) {
    console.log("Nothing to process (no valid userId + Room IDs found).");
    return;
  }

  const now = new Date();

  let totalMatchedConversations = 0;
  let totalUpdatedConversations = 0;
  let totalMissingPairs = 0;

  const CHUNK = 400;

  for (let i = 0; i < pairList.length; i += CHUNK) {
    const chunk = pairList.slice(i, i + CHUNK);

    const orFilter = chunk.map((p) => ({
      userId: p.userId,
      meetingId: p.meetingId,
      ...(ONLY_UNPAID ? { paymentStatus: "unpaid" } : {}),
    }));

    // Find what exists (for logging + missing detection)
    const found = await prisma.conversation.findMany({
      where: { OR: orFilter },
      select: {
        id: true,
        userId: true,
        meetingId: true,
        paymentStatus: true,
      },
    });

    totalMatchedConversations += found.length;

    // Detect missing pairs (no conversation rows found for that (user, room))
    const foundKeys = new Set(found.map((c) => `${c.userId}:${c.meetingId}`));
    for (const p of chunk) {
      const k = `${p.userId}:${p.meetingId}`;
      // Only count missing if we're not filtering by unpaid OR if we are filtering and none unpaid exist.
      // This still helps you see which pairs aren't updatable.
      if (!foundKeys.has(k)) totalMissingPairs++;
    }

    if (DRY_RUN) {
      console.log(
        `[DRY RUN] chunk ${i}-${i + chunk.length - 1}: would update ${
          found.length
        } conversations`
      );
      continue;
    }

    // Update in a transaction (safe + consistent)
    const updates = found.map((c) =>
      prisma.conversation.update({
        where: { id: c.id },
        data: {
          paymentStatus: "paid",
          paidAt: now,
        },
      })
    );

    const results = await prisma.$transaction(updates);
    totalUpdatedConversations += results.length;

    console.log(
      `chunk ${i}-${i + chunk.length - 1}: updated ${
        results.length
      } conversations`
    );
  }

  console.log("\n✅ Summary");
  console.log(`Pairs requested: ${pairList.length}`);
  console.log(`Conversations matched: ${totalMatchedConversations}`);
  console.log(`Conversations updated: ${totalUpdatedConversations}`);
  console.log(
    `Pairs with no matching conversation (based on current filters): ${totalMissingPairs}`
  );

  if (DRY_RUN) {
    console.log(
      "\nNote: You ran with --dry-run, so no database updates were made."
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
