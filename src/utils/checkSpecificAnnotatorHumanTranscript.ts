import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "../config/postgres";
import { s3 } from "../config/aws_s3";

const BUCKET_NAME = process.env.S3_BUCKET_NAME!;
const TARGET_USERNAME = "annotator100006";

function normalizePrefix(p: string) {
  return p.endsWith("/") ? p : `${p}/`;
}

async function checkHumanTranscriptsForAnnotator(username: string) {
  try {
    if (!BUCKET_NAME) throw new Error("S3_BUCKET_NAME is missing");
    if (!username?.trim()) throw new Error("TARGET_USERNAME is empty");

    console.log(`🔍 Fetching annotator "${username}"...`);

    const annotator = await prisma.user.findFirst({
      where: { is_annotator: true, username },
      select: { id: true, username: true, annotation_recordings: true },
    });

    if (!annotator) {
      console.log(`❌ Annotator not found (is_annotator=true): ${username}`);
      return;
    }

    const recordingPaths = (annotator.annotation_recordings ?? [])
      .filter(Boolean)
      .map(normalizePrefix);

    console.log(
      `👤 ${annotator.username} (ID: ${annotator.id})\n📦 Recordings assigned: ${recordingPaths.length}\n`
    );

    if (recordingPaths.length === 0) {
      console.log("⚠️ No annotation_recordings assigned to this annotator.");
      return;
    }

    const found: string[] = [];
    const missing: string[] = [];
    const errors: { key: string; error: any }[] = [];

    for (const basePath of recordingPaths) {
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
        const status = err?.$metadata?.httpStatusCode;

        if (status === 404 || err?.name === "NotFound") {
          console.log(`❌ MISSING: ${key}`);
          missing.push(key);
        } else {
          console.log(`⚠️ ERROR: ${key}`);
          errors.push({ key, error: err });
        }
      }
    }

    console.log("\n==================================");
    console.log("📋 HUMAN TRANSCRIPT REPORT");
    console.log("==================================");
    console.log(`Annotator: ${annotator.username} (ID: ${annotator.id})`);
    console.log(`Total assigned: ${recordingPaths.length}`);
    console.log(`✅ Found:   ${found.length}`);
    console.log(`❌ Missing: ${missing.length}`);
    console.log(`⚠️ Errors:  ${errors.length}\n`);

    if (missing.length > 0) {
      console.log("❌ Missing Files:");
      for (const key of missing) console.log(`   - ${key}`);
      console.log("");
    }

    if (errors.length > 0) {
      console.log("⚠️ Errors (non-404):");
      for (const e of errors) {
        console.log(`   - ${e.key}`);
        console.log(
          `     ${e.error?.name ?? "Error"}: ${e.error?.message ?? e.error}`
        );
      }
      console.log("");
    }
  } catch (err) {
    console.error("❌ Fatal error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

checkHumanTranscriptsForAnnotator(TARGET_USERNAME);
