import {
  ListObjectsV2Command,
  HeadObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { s3 } from "../config/aws_s3";

const BUCKET_NAME = process.env.S3_BUCKET_NAME!;
const ROOT_PREFIX = "Arabic/";

async function exists(key: string): Promise<boolean> {
  try {
    await s3.send(
      new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      })
    );
    return true;
  } catch (err: any) {
    if (err?.$metadata?.httpStatusCode === 404) return false;
    throw err;
  }
}

async function readMetadata(key: string): Promise<number | null> {
  try {
    const res = await s3.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      })
    );

    const streamToString = async (stream: any): Promise<string> => {
      return await new Promise((resolve, reject) => {
        const chunks: any[] = [];
        stream.on("data", (chunk: any) => chunks.push(chunk));
        stream.on("error", reject);
        stream.on("end", () =>
          resolve(Buffer.concat(chunks).toString("utf-8"))
        );
      });
    };

    const raw = await streamToString(res.Body);
    const json = JSON.parse(raw);

    return Number(json.total_duration || 0);
  } catch (err) {
    console.log(`⚠️ Failed to read metadata: ${key}`);
    return null;
  }
}

async function listAllRecordingFolders(): Promise<Set<string>> {
  const folders = new Set<string>();
  let token: string | undefined;

  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: ROOT_PREFIX,
        ContinuationToken: token,
      })
    );

    for (const obj of res.Contents || []) {
      if (!obj.Key) continue;

      const match = obj.Key.match(/(Arabic\/.*?\/recording-\d+\/)/);
      if (match) folders.add(match[1]);
    }

    token = res.NextContinuationToken;
  } while (token);

  return folders;
}

async function auditArabicBucket() {
  console.log("🔍 Scanning full Arabic bucket...\n");

  const folders = await listAllRecordingFolders();
  console.log(`📁 Found ${folders.size} recording folders\n`);

  let missingHumanTotal = 0;
  let missingHumanCount = 0;

  let missingTranscriptionTotal = 0;
  let missingTranscriptionCount = 0;

  const shortRecordings: string[] = [];

  for (const folder of folders) {
    const humanKey = `${folder}human_transcript.txt`;
    const transcriptKey = `${folder}transcription.txt`;
    const metadataKey = `${folder}metadata.txt`;

    const hasHuman = await exists(humanKey);
    const hasTranscript = await exists(transcriptKey);

    const duration = await readMetadata(metadataKey);

    if (duration !== null && duration < 120) {
      shortRecordings.push(`${folder} (${duration}s)`);
    }

    if (!hasHuman && hasTranscript) {
      missingHumanCount++;
      if (duration) missingHumanTotal += duration;

      console.log(`🟡 Missing HUMAN transcript: ${folder}`);
    }

    if (!hasTranscript) {
      missingTranscriptionCount++;
      if (duration) missingTranscriptionTotal += duration;

      console.log(`🔴 Missing TRANSCRIPTION: ${folder}`);
    }
  }

  console.log("\n==============================");
  console.log("📊 ARABIC DATASET REPORT");
  console.log("==============================");

  console.log("\n🟡 Missing HUMAN transcript (but transcription exists)");
  console.log(`Count: ${missingHumanCount}`);
  console.log(`Total Hours: ${(missingHumanTotal / 3600).toFixed(2)} hrs`);

  console.log("\n🔴 Missing transcription.txt");
  console.log(`Count: ${missingTranscriptionCount}`);
  console.log(
    `Total Hours: ${(missingTranscriptionTotal / 3600).toFixed(2)} hrs`
  );

  console.log("\n⏱️ Recordings under 120 seconds:");
  shortRecordings.forEach((r) => console.log(` - ${r}`));

  console.log("\n✅ Audit complete");
}

auditArabicBucket();
