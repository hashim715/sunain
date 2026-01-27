/**
 * add_user_ids_to_csv.ts
 *
 * Usage:
 *   npx tsx add_user_ids_to_csv.ts input.csv output.csv
 *
 * Example:
 *   npx tsx add_user_ids_to_csv.ts /mnt/data/e213047e-99b9-4eb2-b23b-9e220a7c7068.csv ./instapay_with_userIds.csv
 */

import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Row = Record<string, any>;

function normalizeName(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, "");
}

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

  // Fallback: extract all integers from text
  const nums = raw.match(/\d+/g) ?? [];
  return nums.map((x) => Number(x)).filter((n) => Number.isFinite(n));
}

async function main() {
  const inputPath = process.argv[2];
  const outputPath =
    process.argv[3] ||
    path.join(
      process.cwd(),
      `${path.basename(inputPath || "input.csv", ".csv")}_with_userIds.csv`
    );

  if (!inputPath) {
    throw new Error(
      "Missing input CSV path.\nUsage: npx tsx add_user_ids_to_csv.ts input.csv output.csv"
    );
  }

  const csvText = fs.readFileSync(inputPath, "utf8");
  const rows: Row[] = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const NAME_COL = "Name";
  const ROOM_IDS_COL = "Room IDs";

  // Collect meetingIds per row and globally
  const allMeetingIdsSet = new Set<number>();
  const rowMeetingIds: number[][] = rows.map((r) => {
    const ids = parseRoomIds(r[ROOM_IDS_COL]);
    ids.forEach((id) => allMeetingIdsSet.add(id));
    return ids;
  });
  const allMeetingIds = Array.from(allMeetingIdsSet);

  // Fetch participants for all meetings in one query
  const participants = allMeetingIds.length
    ? await prisma.meetingParticipant.findMany({
        where: { meetingId: { in: allMeetingIds } },
        select: {
          meetingId: true,
          userId: true,
          user: { select: { name: true } },
        },
      })
    : [];

  // Map meetingId -> participants
  const byMeetingId = new Map<
    number,
    { userId: number; nameNorm: string; nameRaw: string | null }[]
  >();

  for (const p of participants) {
    const arr = byMeetingId.get(p.meetingId) ?? [];
    arr.push({
      userId: p.userId,
      nameNorm: normalizeName(p.user.name || ""),
      nameRaw: p.user.name ?? null,
    });
    byMeetingId.set(p.meetingId, arr);
  }

  let matched = 0;
  let unmatched = 0;

  const unmatchedRows: { row: number; name: string; roomIds: number[] }[] = [];

  const outRows = rows.map((r, idx) => {
    const name = String(r[NAME_COL] ?? "").trim();
    const target = normalizeName(name);
    const meetingIds = rowMeetingIds[idx];

    // Gather candidates from the row's rooms
    const candidates: {
      userId: number;
      nameNorm: string;
      nameRaw: string | null;
    }[] = [];
    for (const mid of meetingIds) {
      const list = byMeetingId.get(mid);
      if (list?.length) candidates.push(...list);
    }

    // 1) exact normalized match
    let hit = candidates.find((c) => c.nameNorm === target);

    // 2) fallback contains match
    if (!hit && target) {
      hit =
        candidates.find((c) => c.nameNorm.includes(target)) ||
        candidates.find((c) => target.includes(c.nameNorm));
    }

    const userId = hit?.userId ?? "";

    if (userId) {
      matched++;
    } else {
      unmatched++;
      unmatchedRows.push({
        row: idx + 1,
        name,
        roomIds: meetingIds,
      });
    }

    return {
      ...r,
      userId,
    };
  });

  const outputCsv = stringify(outRows, {
    header: true,
    columns: Object.keys(outRows[0] || { userId: "" }),
  });

  fs.writeFileSync(outputPath, outputCsv, "utf8");

  console.log(
    `Done.\nInput rows: ${rows.length}\nMatched: ${matched}\nUnmatched: ${unmatched}\nOutput: ${outputPath}`
  );

  // Print unmatched names (deduped by name+roomIds)
  if (unmatchedRows.length) {
    console.log("\n⚠️ Unmatched CSV Names:");
    const seen = new Set<string>();
    for (const u of unmatchedRows) {
      const key = `${u.name}|${u.roomIds.join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);

      console.log(
        `- Row ${u.row}: "${u.name}" | Room IDs: [${u.roomIds.join(", ")}]`
      );
    }
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
