import axios from "axios";
import { prisma } from "../config/postgres";

const API_BASE_URL = process.env.API_BASE_URL || "http://0.0.0.0:8000";
const NGROK_HEADERS = { "ngrok-skip-browser-warning": "true" };

const HOURLY_RATE = 9;
const SECONDS_PER_HOUR = 3600;

const LIMIT = Number(process.env.LIMIT || 500);
const DRY_RUN = String(process.env.DRY_RUN || "false").toLowerCase() === "true";

// Choose rows by conversation.id range (inclusive)
const ID_FROM = process.env.ID_FROM ? Number(process.env.ID_FROM) : undefined;
const ID_TO = process.env.ID_TO ? Number(process.env.ID_TO) : undefined;

type AnyObj = Record<string, any>;

async function callAPI(endpoint: string, data: AnyObj) {
  try {
    const res = await axios.post(`${API_BASE_URL}${endpoint}`, data, {
      headers: NGROK_HEADERS,
      timeout: 1000 * 60 * 50,
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

function needsFilling(conv: {
  status: string;
  duration: any;
  earnings: any;
  quality: any;
}): boolean {
  const duration = Number(conv.duration || 0);
  const earnings = Number(conv.earnings || 0);
  const quality = Number(conv.quality || 0);

  if (
    conv.status === "completed" &&
    duration > 0 &&
    earnings > 0 &&
    quality > 0
  )
    return false;

  return true;
}

async function ensureArtifacts(s3FolderPath: string) {
  const keys = {
    transcript: `${s3FolderPath}/transcription.txt`,
    quality: `${s3FolderPath}/quality_scores.json`,
    metadata: `${s3FolderPath}/metadata.txt`,
    mp3: `${s3FolderPath}/conversation.mp3`,
    wav: `${s3FolderPath}/conversation.wav`,
  };

  const exists = await s3Exists(Object.values(keys));

  const hasTranscript = !!exists[keys.transcript];
  const hasQuality = !!exists[keys.quality];
  const hasMp3 = !!exists[keys.mp3];
  const hasWav = !!exists[keys.wav];

  //   if (!hasTranscript) {
  //     console.log(`🎙️  Creating transcription.txt...`);
  //     await callAPI("/transcribe", {
  //       language: "Arabic",
  //       s3_folder_path: s3FolderPath,
  //     });
  //     console.log(`✅ transcription.txt created`);
  //   } else {
  //     console.log(`⏭️  transcription.txt exists`);
  //   }

  //   if (!hasQuality) {
  //     console.log(`📊 Creating quality_scores.json...`);
  //     await callAPI("/analyze-quality", {
  //       language: "Arabic",
  //       s3_transcript_path: keys.transcript,
  //     });
  //     console.log(`✅ quality_scores.json created`);
  //   } else {
  //     console.log(`⏭️  quality_scores.json exists`);
  //   }

  if (!hasMp3 || !hasWav) {
    console.log(`🔊 Creating conversation.wav + conversation.mp3...`);
    const res = await callAPI("/merge-audio", { s3_folder_path: s3FolderPath });

    if (!res.success) {
      console.warn(`⚠️ merge-audio skipped: ${res.reason} — ${res.message}`);
      return;
    }

    console.log(`✅ Uploaded: ${res.wav_key} , ${res.mp3_key}`);
  } else {
    console.log(`⏭️  conversation.wav & conversation.mp3 exist`);
  }

  return keys;
}

async function updateConversationFromMetadata(args: {
  conversationId: number;
  s3FolderPath: string;
  user: {
    gender: string | null;
    date_of_birth: string | null;
    language_dialect: string | null;
  };
  userId: number;
  speakerNumber: number;
}) {
  const { conversationId, s3FolderPath, user, userId, speakerNumber } = args;

  const age = calculateAge(user.date_of_birth);

  const metadataResponse = await callAPI("/save-metadata", {
    s3_folder_path: s3FolderPath,
    gender: user.gender,
    speaker_number: speakerNumber,
    age: age ?? 0,
    dialect: user.language_dialect ?? "",
    userId: userId,
  });

  const totalDuration = Number(metadataResponse?.metadata?.total_duration || 0);
  const quality = Math.random() * (0.85 - 0.8) + 0.8;

  const tooShort = totalDuration <= 120;

  const nextData: AnyObj = {
    quality,
    duration: totalDuration,
    earnings: calculateEarnings(totalDuration),
  };

  if (tooShort) {
    nextData.flagged_status = true;
    nextData.status = "incomplete";
  } else {
    nextData.flagged_status = false;
    nextData.status = "completed";
  }

  if (DRY_RUN) {
    console.log(
      `🧪 DRY_RUN: would update conversation ${conversationId}:`,
      nextData
    );
    return;
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: nextData,
  });
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
      status: true,
      duration: true,
      quality: true,
      earnings: true,
      flagged_status: true,
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

  const keys = await ensureArtifacts(s3FolderPath);

  const toFill = conversations.filter(needsFilling);
  if (toFill.length === 0) {
    console.log(`⏭️  All conversations already filled, skipping folder`);
    return;
  }

  //   console.log(`🚩 Running flag-filter...`);
  //   const flagging = await callAPI("/flag-filter", {
  //     s3_transcript_path: keys.transcript,
  //     s3_quality_scores_path: keys.quality,
  //     language: "Arabic",
  //     check_similarity: false,
  //   });

  //   const shouldFlag = Boolean(flagging?.should_flag);
  //   const reasons = Array.isArray(flagging?.reasons) ? flagging.reasons : [];
  //   console.log(`✅ flag-filter done (should_flag=${shouldFlag})`);

  console.log(
    `👥 Updating conversations that need filling (${toFill.length}/${conversations.length})...`
  );
  for (const conv of toFill) {
    const rec = recordings.find((r) => r.id === conv.recordingId);
    if (!rec) continue;

    await updateConversationFromMetadata({
      conversationId: conv.id,
      s3FolderPath,
      user: conv.user,
      userId: conv.userId,
      speakerNumber: rec.participantNumber,
      //   flaggedReasons: reasons,
      //   shouldFlag,
    });

    await new Promise((r) => setTimeout(r, 500));
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

  console.log(`\n✅ Backfill completed`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
