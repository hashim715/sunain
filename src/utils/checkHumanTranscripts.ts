import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "../config/aws_s3";

const BUCKET_NAME = process.env.S3_BUCKET_NAME!;

const RECORDING_PATHS = [
  "Arabic/2026-01-25/2026-01-25-03:29-p.m.-1769383748977/recording-1/",
  "Arabic/2026-01-27/2026-01-27-02:00-a.m.-1769508043880/recording-3/",
  "Arabic/2026-01-27/2026-01-27-02:07-a.m.-1769508465858/recording-1/",
  "Arabic/2026-01-27/2026-01-27-02:07-a.m.-1769508465858/recording-2/",
  "Arabic/2026-01-27/2026-01-27-02:08-a.m.-1769508493111/recording-1/",
  "Arabic/2026-01-27/2026-01-27-02:08-a.m.-1769508496462/recording-1/",
  "Arabic/2026-01-27/2026-01-27-02:08-a.m.-1769508496462/recording-2/",
  "Arabic/2026-01-27/2026-01-27-02:08-a.m.-1769508496462/recording-3/",
  "Arabic/2026-01-27/2026-01-27-02:09-a.m.-1769508567554/recording-1/",
  "Arabic/2026-01-27/2026-01-27-02:09-a.m.-1769508567554/recording-2/",
  "Arabic/2026-01-27/2026-01-27-02:09-a.m.-1769508567554/recording-3/",
  "Arabic/2026-01-27/2026-01-27-02:10-a.m.-1769508644785/recording-1/",
  "Arabic/2026-01-27/2026-01-27-02:11-a.m.-1769508682826/recording-1/",
  "Arabic/2026-01-27/2026-01-27-02:11-a.m.-1769508682826/recording-2/",
  "Arabic/2026-01-27/2026-01-27-02:11-a.m.-1769508682826/recording-3/",
  "Arabic/2026-01-27/2026-01-27-02:11-a.m.-1769508719650/recording-1/",
  "Arabic/2026-01-27/2026-01-27-02:12-a.m.-1769508773282/recording-1/",
  "Arabic/2026-01-27/2026-01-27-02:13-a.m.-1769508810229/recording-1/",
  "Arabic/2026-01-27/2026-01-27-02:15-a.m.-1769508916026/recording-1/",
  "Arabic/2026-01-27/2026-01-27-02:15-a.m.-1769508916026/recording-2/",
  "Arabic/2026-01-27/2026-01-27-02:15-a.m.-1769508916026/recording-3/",
  "Arabic/2026-01-27/2026-01-27-02:16-a.m.-1769508970742/recording-1/",
  "Arabic/2026-01-27/2026-01-27-02:21-a.m.-1769509319259/recording-2/",
  "Arabic/2026-01-27/2026-01-27-02:21-a.m.-1769509319259/recording-3/",
  "Arabic/2026-01-27/2026-01-27-02:26-a.m.-1769509595060/recording-1/",
  "Arabic/2026-01-27/2026-01-27-02:26-a.m.-1769509595060/recording-2/",
  "Arabic/2026-01-27/2026-01-27-02:26-a.m.-1769509607066/recording-1/",
  "Arabic/2026-01-27/2026-01-27-02:26-a.m.-1769509607066/recording-2/",
  "Arabic/2026-01-27/2026-01-27-02:31-a.m.-1769509918161/recording-1/",
  "Arabic/2026-01-27/2026-01-27-02:31-a.m.-1769509918161/recording-2/",
  "Arabic/2026-01-27/2026-01-27-02:33-a.m.-1769510023172/recording-1/",
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
