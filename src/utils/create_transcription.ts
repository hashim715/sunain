import axios from "axios";
import { prisma } from "../config/postgres";

const API_BASE_URL = process.env.API_BASE_URL || "http://0.0.0.0:8000";
const NGROK_HEADERS = { "ngrok-skip-browser-warning": "true" };

const HOURLY_RATE = 9;
const SECONDS_PER_HOUR = 3600;

const LIMIT = Number(process.env.LIMIT || 500);
const DRY_RUN = String(process.env.DRY_RUN || "false").toLowerCase() === "true";

const ID_FROM = process.env.ID_FROM ? Number(process.env.ID_FROM) : undefined;
const ID_TO = process.env.ID_TO ? Number(process.env.ID_TO) : undefined;

type AnyObj = Record<string, any>;

async function callAPI(endpoint: string, data: AnyObj) {
  try {
    const res = await axios.post(`${API_BASE_URL}${endpoint}`, data, {
      headers: NGROK_HEADERS,
      timeout: 1000 * 60 * 15,
    });
    return res.data;
  } catch (err: any) {
    const msg = err?.response?.data
      ? JSON.stringify(err.response.data)
      : err?.message;
    throw new Error(`API call failed [${endpoint}]: ${msg}`);
  }
}

async function s3Exists(keys: string[]): Promise<Record<string, boolean>> {
  const res = await callAPI("/s3-exists", { keys });
  return res?.exists || {};
}

function calculateEarnings(durationSeconds: number): number {
  return (durationSeconds / SECONDS_PER_HOUR) * HOURLY_RATE;
}

function calculateAge(dob?: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  if (age < 0 || age > 120) return null;
  return age;
}

function s3KeyToFolderPath(s3Key: string): string {
  const key = s3Key.replace(/^\/+/, "");
  const parts = key.split("/");
  if (parts.length < 2) throw new Error(`Invalid s3Key: ${s3Key}`);
  parts.pop();
  return parts.join("/");
}

async function ensureTranscription(args: {
  s3FolderPath: string;
  totalDurationSeconds: number;
}) {
  const { s3FolderPath, totalDurationSeconds } = args;

  const transcriptKey = `${s3FolderPath}/transcription.txt`;
  const exists = await s3Exists([transcriptKey]);
  const hasTranscript = !!exists[transcriptKey];

  if (totalDurationSeconds < 120) {
    console.log(
      `⏭️  Skipping transcription (duration=${totalDurationSeconds}s < 120s)`
    );
    return;
  }

  if (hasTranscript) {
    console.log(`⏭️  transcription.txt exists`);
    return;
  }

  console.log(`🎙️  Creating transcription.txt...`);
  await callAPI("/transcribe", {
    language: "Arabic",
    s3_folder_path: s3FolderPath,
  });
  console.log(`✅ transcription.txt created`);
}

async function processOneRecordingFolder(args: {
  meetingName: string;
  recordingNumber: number;
  s3FolderPath: string;
}) {
  const { meetingName, recordingNumber, s3FolderPath } = args;

  const meeting = await prisma.meeting.findUnique({
    where: { sessionName: meetingName },
    select: { id: true, language: true },
  });
  if (!meeting || meeting.language !== "Arabic") return;

  console.log(`\n==============================`);
  console.log(`🎯 Folder: ${s3FolderPath}`);

  const recordings = await prisma.recording.findMany({
    where: { meetingName, recordingNumber },
    select: { id: true, participantNumber: true },
    orderBy: { participantNumber: "asc" },
  });

  if (recordings.length < 2) {
    console.warn(
      `⚠️ Skipping: only found ${recordings.length} recording rows (need 2)`
    );
    return;
  }

  const recordingIds = recordings.map((r) => r.id);

  const conversations = await prisma.conversation.findMany({
    where: { meetingId: meeting.id, recordingId: { in: recordingIds } },
    select: {
      id: true,
      userId: true,
      recordingId: true,
      user: {
        select: { gender: true, date_of_birth: true, language_dialect: true },
      },
    },
  });

  if (conversations.length < 2) {
    console.warn(
      `⚠️ Skipping: only found ${conversations.length} conversation rows (need 2)`
    );
    return;
  }

  const firstConv = conversations[0];
  const firstRec = recordings.find((r) => r.id === firstConv.recordingId);
  if (!firstRec) {
    console.warn(`⚠️ Skipping: missing recording row for first conversation`);
    return;
  }

  const age = calculateAge(firstConv.user.date_of_birth);

  const metadataResponse = await callAPI("/save-metadata", {
    s3_folder_path: s3FolderPath,
    gender: firstConv.user.gender,
    speaker_number: firstRec.participantNumber,
    age: age ?? 0,
    dialect: firstConv.user.language_dialect ?? "",
    userId: firstConv.userId,
  });

  const totalDuration = Number(metadataResponse?.metadata?.total_duration || 0);

  if (!DRY_RUN) {
    await ensureTranscription({
      s3FolderPath,
      totalDurationSeconds: totalDuration,
    });
  } else {
    console.log(
      `🧪 DRY_RUN: would ensure transcription (duration=${totalDuration}s)`
    );
  }

  console.log(`✅ Folder completed`);
}

async function main() {
  console.log(`API_BASE_URL=${API_BASE_URL}`);
  console.log(
    `LIMIT=${LIMIT} | DRY_RUN=${DRY_RUN} | ID_FROM=${ID_FROM ?? "-"} | ID_TO=${
      ID_TO ?? "-"
    }\n`
  );

  const whereClause: any = {
    meeting: { language: "Arabic" },
    recordingId: { not: null },
  };

  if (ID_FROM !== undefined || ID_TO !== undefined) {
    whereClause.id = {};
    if (ID_FROM !== undefined) whereClause.id.gte = ID_FROM;
    if (ID_TO !== undefined) whereClause.id.lte = ID_TO;
  }

  const candidates = await prisma.conversation.findMany({
    where: whereClause,
    select: {
      id: true,
      recording: {
        select: { meetingName: true, recordingNumber: true, s3Key: true },
      },
    },
    take: LIMIT,
    orderBy: { id: "asc" },
  });

  console.log(`Found ${candidates.length} candidate conversations`);

  const jobMap = new Map<
    string,
    { meetingName: string; recordingNumber: number; s3FolderPath: string }
  >();

  for (const c of candidates) {
    const rec = c.recording;
    if (!rec?.s3Key) continue;

    const s3FolderPath = s3KeyToFolderPath(rec.s3Key);
    const k = `${rec.meetingName}::${rec.recordingNumber}::${s3FolderPath}`;
    if (!jobMap.has(k)) {
      jobMap.set(k, {
        meetingName: rec.meetingName,
        recordingNumber: rec.recordingNumber,
        s3FolderPath,
      });
    }
  }

  const jobs = Array.from(jobMap.values());
  console.log(`Unique recording folders to process: ${jobs.length}`);

  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i];
    console.log(
      `\n➡️  [${i + 1}/${jobs.length}] ${j.meetingName} recording-${
        j.recordingNumber
      }`
    );
    try {
      await processOneRecordingFolder(j);
    } catch (e: any) {
      console.error(`❌ Failed folder ${j.s3FolderPath}: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`\n✅ Transcription backfill completed`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
