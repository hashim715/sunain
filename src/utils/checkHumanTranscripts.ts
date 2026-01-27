import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "../config/aws_s3";

const BUCKET_NAME = process.env.S3_BUCKET_NAME!;

const RECORDING_PATHS = [
  "Arabic/2026-01-25/2026-01-25-04:21-a.m.-1769343684668/recording-1/",
  "Arabic/2026-01-25/2026-01-25-04:25-p.m.-17623523523553/recording-2/",
  "Arabic/2026-01-25/2026-01-25-04:27-a.m.-1769344027887/recording-1/",
  "Arabic/2026-01-25/2026-01-25-04:27-a.m.-1769344027887/recording-2/",
  "Arabic/2026-01-25/2026-01-25-04:27-a.m.-1769344027887/recording-3/",
  "Arabic/2026-01-25/2026-01-25-04:27-a.m.-1769344027887/recording-4/",
  "Arabic/2026-01-25/2026-01-25-04:31-a.m.-1769344304108/recording-1/",
  "Arabic/2026-01-25/2026-01-25-04:32-a.m.-1769344375858/recording-1/",
  "Arabic/2026-01-25/2026-01-25-04:35-a.m.-1769344511384/recording-1/",
  "Arabic/2026-01-25/2026-01-25-04:35-a.m.-1769344511384/recording-2/",
  "Arabic/2026-01-25/2026-01-25-04:39-a.m.-1769344759368/recording-2/",
  "Arabic/2026-01-25/2026-01-25-04:40-a.m.-1769344849906/recording-1/",
  "Arabic/2026-01-25/2026-01-25-04:41-a.m.-1769344887699/recording-1/",
  "Arabic/2026-01-25/2026-01-25-04:52-a.m.-1769345545844/recording-1/",
  "Arabic/2026-01-25/2026-01-25-04:52-a.m.-1769345545844/recording-2/",
  "Arabic/2026-01-25/2026-01-25-04:52-a.m.-1769345545844/recording-3/",
  "Arabic/2026-01-25/2026-01-25-04:53-a.m.-1769345611538/recording-1/",
  "Arabic/2026-01-25/2026-01-25-04:53-a.m.-1769345611538/recording-2/",
  "Arabic/2026-01-25/2026-01-25-04:53-a.m.-1769345611538/recording-3/",
  "Arabic/2026-01-25/2026-01-25-04:55-a.m.-1769345700880/recording-1/",
  "Arabic/2026-01-25/2026-01-25-04:55-a.m.-1769345700880/recording-2/",
];

async function checkHumanTranscripts() {
  console.log(
    `🔍 Checking ${RECORDING_PATHS.length} folders for human_transcript.txt\n`
  );

  const found: string[] = [];
  const missing: string[] = [];

  for (const basePath of RECORDING_PATHS) {
    const key = `${basePath}human_transcript.txt`;

    try {
      await s3.send(
        new HeadObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
        })
      );

      console.log(`✅ FOUND: ${key}`);
      found.push(key);
    } catch (err: any) {
      if (err?.$metadata?.httpStatusCode === 404) {
        console.log(`❌ MISSING: ${key}`);
        missing.push(key);
      } else {
        console.log(`⚠️ ERROR: ${key}`);
        console.error(err);
      }
    }
  }

  console.log("\n==================================");
  console.log("📋 HUMAN TRANSCRIPT REPORT");
  console.log("==================================");
  console.log(`✅ Found:   ${found.length}`);
  console.log(`❌ Missing: ${missing.length}\n`);

  if (missing.length > 0) {
    console.log("❌ Missing Files:");
    missing.forEach((key) => console.log(`   - ${key}`));
  }
}

checkHumanTranscripts();
