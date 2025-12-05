import { toStringArray } from "../utils/zoomSdkAuthEndpointUtils";
import {
  inNumberArray,
  isBetween,
  isLengthLessThan,
  isRequired,
  matchesStringArray,
  validateRequest,
  isValidPasscode,
} from "../utils/zoomSDKAuthEndpointValidations";
import dotenv from "dotenv";
import { KJUR } from "jsrsasign";
import { Request, Response, NextFunction, RequestHandler } from "express";
import { logger } from "../utils/logger";
import { internalServerError } from "./errors";
import { prisma } from "../config/postgres";
import {
  S3Client,
  CopyObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import Queue from "bull";

dotenv.config();

const validator = {
  role: [isRequired, inNumberArray([0, 1])],
  sessionName: [isRequired, isLengthLessThan(200)],
  expirationSeconds: isBetween(1800, 172800),
  userIdentity: isLengthLessThan(35),
  sessionKey: isLengthLessThan(36),
  geoRegions: matchesStringArray([
    "AU",
    "BR",
    "CA",
    "CN",
    "DE",
    "HK",
    "IN",
    "JP",
    "MX",
    "NL",
    "SG",
    "US",
  ]),
  cloudRecordingOption: inNumberArray([0, 1]),
  cloudRecordingElection: inNumberArray([0, 1]),
  videoWebRtcMode: inNumberArray([0, 1]),
  audioCompatibleMode: inNumberArray([0, 1]),
  audioWebRtcMode: inNumberArray([0, 1]),
  passcode: isValidPasscode,
};

const coerceRequestBody = (body: any): any => ({
  ...body,
  ...[
    "role",
    "expirationSeconds",
    "cloudRecordingOption",
    "cloudRecordingElection",
    "videoWebRtcMode",
    "audioCompatibleMode",
    "audioWebRtcMode",
  ].reduce(
    (acc, cur) => ({
      ...acc,
      [cur]: typeof body[cur] === "string" ? parseInt(body[cur]) : body[cur],
    }),
    {}
  ),

  ...(body.passcode && { passcode: body.passcode.trim() }),
});

const joinGeoRegions = (geoRegions: any): string | undefined =>
  toStringArray(geoRegions)?.join(",");

export const generateZoomSignature: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!process.env.ZOOM_VIDEO_SDK_KEY || !process.env.ZOOM_VIDEO_SDK_SECRET) {
      logger.error(
        "Zoom SDK credentials not configured in environment variables"
      );
      return res.status(500).json({
        success: false,
        message: "Zoom SDK credentials not configured",
      });
    }

    const requestBody = coerceRequestBody(req.body);
    const validationErrors = validateRequest(requestBody, validator);

    if (validationErrors.length > 0) {
      return res.status(400).json({ message: validationErrors });
    }

    const {
      role,
      sessionName,
      expirationSeconds,
      userIdentity,
      sessionKey,
      geoRegions,
      cloudRecordingOption,
      cloudRecordingElection,
      telemetryTrackingId,
      videoWebRtcMode,
      audioCompatibleMode,
      audioWebRtcMode,
      passcode,
    } = requestBody;

    const iat = Math.floor(Date.now() / 1000);
    const exp = expirationSeconds ? iat + expirationSeconds : iat + 60 * 60 * 2;
    const oHeader = { alg: "HS256", typ: "JWT" };

    const oPayload = {
      app_key: process.env.ZOOM_VIDEO_SDK_KEY,
      role_type: role,
      tpc: sessionName,
      version: 1,
      iat,
      exp,
      user_identity: userIdentity,
      session_key: sessionKey,
      geo_regions: joinGeoRegions(geoRegions),
      cloud_recording_option: cloudRecordingOption,
      cloud_recording_election: cloudRecordingElection,
      telemetry_tracking_id: telemetryTrackingId,
      video_webrtc_mode: videoWebRtcMode,
      audio_webrtc_mode: audioWebRtcMode ?? audioCompatibleMode,
      password: passcode,
    };

    const sHeader = JSON.stringify(oHeader);
    const sPayload = JSON.stringify(oPayload);

    const secretKey = process.env.ZOOM_VIDEO_SDK_SECRET as string;
    const sdkJWT = KJUR.jws.JWS.sign("HS256", sHeader, sPayload, secretKey);

    return res.status(200).json({ signature: sdkJWT });
  } catch (err) {
    logger.error(`Error generating Zoom signature: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

const s3Client = new S3Client({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  region: process.env.AWS_REGION || "us-east-2",
});

const parseS3Url = (
  externalStorageUrl: string
): { bucket: string; key: string } | null => {
  const match = externalStorageUrl.match(/^s3:\/\/([^\/]+)\/(.+)$/);

  if (match) {
    return {
      bucket: match[1],
      key: match[2],
    };
  }

  return null;
};

const extractTimestampFromS3Key = (s3Key: string): Date | null => {
  const match = s3Key.match(/GMT(\d{8})-(\d{6})/);

  if (match) {
    const dateStr = match[1];
    const timeStr = match[2];

    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    const hour = timeStr.substring(0, 2);
    const minute = timeStr.substring(2, 4);
    const second = timeStr.substring(4, 6);

    return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
  }

  return null;
};

const getAllFilesFromS3Directory = async (
  bucket: string,
  prefix: string
): Promise<string[]> => {
  console.log(`🔍 Listing files in S3: ${bucket}/${prefix}`);

  const command = new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: prefix,
  });

  const response = await s3Client.send(command);
  const files =
    response.Contents?.map((obj) => obj.Key!)
      .filter((key) => key.endsWith(".m4a"))
      .sort() || [];

  console.log(`📦 Found ${files.length} audio files`);
  return files;
};

const getAllFilesFromMultipleDirectories = async (
  bucket: string,
  directories: string[]
): Promise<string[]> => {
  console.log(`🔍 Searching ${directories.length} S3 directories...`);

  const allFiles: string[] = [];

  for (const directory of directories) {
    const files = await getAllFilesFromS3Directory(bucket, directory);
    allFiles.push(...files);
  }

  console.log(`📦 Total files across all directories: ${allFiles.length}`);
  return allFiles.sort();
};

const groupFilesInOrder = (
  files: string[],
  participantCount: number
): string[][] => {
  const groups: string[][] = [];

  for (let i = 0; i < files.length; i += participantCount) {
    const group = files.slice(i, i + participantCount);
    groups.push(group);
  }

  console.log(
    `📊 Grouped ${files.length} files into ${groups.length} sessions`
  );
  groups.forEach((group, index) => {
    console.log(`   Session ${index + 1}: ${group.length} files`);
    group.forEach((file) => {
      const timestamp = extractTimestampFromS3Key(file);
      console.log(
        `      - ${file.split("/").pop()} (${timestamp?.toISOString()})`
      );
    });
  });

  return groups;
};

interface WebhookDirectories {
  meetingName: string;
  bucket: string;
  directories: string[];
  lastUpdated: number;
}

const storeWebhookDirectory = async (
  meetingName: string,
  bucket: string,
  directory: string
): Promise<string[]> => {
  const redisKey = `webhook:directories:${meetingName}`;

  const existingData = await recordingQueue.client.get(redisKey);

  let directories: string[] = [];

  if (existingData) {
    const parsed: WebhookDirectories = JSON.parse(existingData);
    directories = parsed.directories;

    if (!directories.includes(directory)) {
      directories.push(directory);
      console.log(`📁 Added new directory for meeting ${meetingName}`);
    } else {
      console.log(`⚠️ Directory already tracked, skipping`);
    }
  } else {
    directories = [directory];
    console.log(`📁 First directory for meeting ${meetingName}`);
  }

  const data: WebhookDirectories = {
    meetingName,
    bucket,
    directories,
    lastUpdated: Date.now(),
  };

  await recordingQueue.client.setex(redisKey, 172800, JSON.stringify(data));

  console.log(`💾 Stored ${directories.length} directories for ${meetingName}`);

  return directories;
};

export const recordingQueue = new Queue("zoom-recordings", {
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
  },
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "fixed",
      delay: 120000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

export const handleZoomWebhook: RequestHandler = async (req, res) => {
  try {
    const { event, payload } = req.body;

    if (event === "endpoint.url_validation") {
      const plainToken = payload?.plainToken;
      if (plainToken) {
        const crypto = require("crypto");
        const hash = crypto
          .createHmac("sha256", process.env.ZOOM_WEBHOOK_SECRET_TOKEN || "")
          .update(plainToken)
          .digest("hex");

        return res.status(200).json({
          plainToken: plainToken,
          encryptedToken: hash,
        });
      }
    }

    if (event !== "session.recording_completed") {
      return res.status(200).json({ message: "Event ignored", event });
    }

    const meetingName = payload?.object?.session_name;
    const participantAudioFiles = payload?.object?.participant_audio_files;

    if (
      !meetingName ||
      !participantAudioFiles ||
      participantAudioFiles.length === 0
    ) {
      return res.status(400).json({ message: "Invalid payload" });
    }

    console.log("🔍 WEBHOOK RECEIVED");
    console.log(`   Meeting: ${meetingName}`);
    console.log(`   Files reported: ${participantAudioFiles.length}`);

    const firstFile = participantAudioFiles[0];
    const parsed = parseS3Url(firstFile.external_storage_url);

    if (!parsed) {
      console.error("❌ Could not parse S3 URL");
      return res.status(400).json({ message: "Invalid S3 URL" });
    }

    const s3Directory = parsed.key.substring(
      0,
      parsed.key.lastIndexOf("/") + 1
    );

    console.log(`📁 S3 Directory: ${parsed.bucket}/${s3Directory}`);

    const allDirectories = await storeWebhookDirectory(
      meetingName,
      parsed.bucket,
      s3Directory
    );

    const pendingSessions = await prisma.recordingSession.findMany({
      where: {
        meetingName,
        status: {
          in: ["incomplete", "interrupted"],
        },
      },
      orderBy: { recordingNumber: "asc" },
    });

    if (pendingSessions.length === 0) {
      console.log("✅ No pending sessions - all recordings already processed");
      return res.status(200).json({
        message: "No pending sessions to process",
      });
    }

    console.log(
      `💾 Found ${pendingSessions.length} pending sessions in database`
    );
    pendingSessions.forEach((session) => {
      console.log(`   - Session ${session.recordingNumber}: ${session.status}`);
    });

    const participantCount = pendingSessions[0]?.participantCount || 2;

    const expectedTotalFiles = pendingSessions.length * participantCount;

    const incompleteCount = pendingSessions.filter(
      (s) => s.status === "incomplete"
    ).length;
    const interruptedCount = pendingSessions.filter(
      (s) => s.status === "interrupted"
    ).length;

    console.log(`📊 Expected: ${expectedTotalFiles} files total`);
    console.log(`   - ${incompleteCount} incomplete sessions (will be saved)`);
    console.log(
      `   - ${interruptedCount} interrupted sessions (will be deleted)`
    );
    console.log(`   - ${participantCount} participants per session`);

    const existingJobs = await recordingQueue.getJobs([
      "waiting",
      "delayed",
      "active",
    ]);

    for (const job of existingJobs) {
      if (job.data.meetingName === meetingName) {
        console.log(`🗑️ Removing old job: ${job.id}`);
        await job.remove();
      }
    }

    await recordingQueue.add(
      "process-meeting",
      {
        meetingName,
        bucket: parsed.bucket,
        directories: allDirectories,
      },
      {
        jobId: `${meetingName}-${Date.now()}`,
        delay: 120000,
      }
    );

    console.log(
      `✅ Queued processing job with ${allDirectories.length} directories`
    );

    return res.status(200).json({
      success: true,
      message: "Processing queued",
      pendingSessions: pendingSessions.length,
      directories: allDirectories.length,
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

recordingQueue.process("process-meeting", async (job: any) => {
  const { meetingName, bucket, directories } = job.data;

  console.log(`📥 Processing meeting: ${meetingName}`);
  console.log(`   Attempt: ${job.attemptsMade + 1}`);
  console.log(`   Directories: ${directories.length}`);
  directories.forEach((dir: string, i: number) => {
    console.log(`      ${i + 1}. ${dir}`);
  });

  const pendingSessions = await prisma.recordingSession.findMany({
    where: {
      meetingName,
      status: {
        in: ["incomplete", "interrupted"],
      },
    },
    orderBy: { recordingNumber: "asc" },
  });

  if (pendingSessions.length === 0) {
    console.log("✅ No pending sessions found - all already processed");

    await recordingQueue.client.del(`webhook:directories:${meetingName}`);

    return {
      success: true,
      message: "All sessions already processed",
      sessionsProcessed: 0,
      sessionsDeleted: 0,
    };
  }

  console.log(`💾 Found ${pendingSessions.length} pending sessions`);
  pendingSessions.forEach((session) => {
    console.log(`   - Session ${session.recordingNumber}: ${session.status}`);
  });

  const participantCount = pendingSessions[0]?.participantCount || 2;

  const expectedTotalFiles = pendingSessions.length * participantCount;

  const incompleteCount = pendingSessions.filter(
    (s) => s.status === "incomplete"
  ).length;
  const interruptedCount = pendingSessions.filter(
    (s) => s.status === "interrupted"
  ).length;

  console.log(`📊 Expected: ${expectedTotalFiles} files total`);
  console.log(
    `   - ${incompleteCount} incomplete sessions × ${participantCount} = ${
      incompleteCount * participantCount
    } files to save`
  );
  console.log(
    `   - ${interruptedCount} interrupted sessions × ${participantCount} = ${
      interruptedCount * participantCount
    } files to delete`
  );

  const allFiles = await getAllFilesFromMultipleDirectories(
    bucket,
    directories
  );

  console.log(`📦 Files in S3: ${allFiles.length}/${expectedTotalFiles}`);

  if (allFiles.length < expectedTotalFiles) {
    const missing = expectedTotalFiles - allFiles.length;
    console.log(`⏳ Waiting for ${missing} more file(s)...`);
    throw new Error(
      `Incomplete: ${allFiles.length}/${expectedTotalFiles} files ready`
    );
  }

  console.log(`✅ All ${expectedTotalFiles} files are ready!`);

  const fileGroups = groupFilesInOrder(allFiles, participantCount);

  let processedCount = 0;
  let deletedCount = 0;

  for (let i = 0; i < pendingSessions.length; i++) {
    const session = pendingSessions[i];
    const files = fileGroups[i] || [];

    console.log(
      `📦 Processing session ${session.recordingNumber} (${session.status})`
    );

    if (session.status === "interrupted") {
      console.log(
        `🗑️ Deleting interrupted recording ${session.recordingNumber}`
      );

      if (files.length > 0) {
        for (const s3Key of files) {
          try {
            await s3Client.send(
              new HeadObjectCommand({ Bucket: bucket, Key: s3Key })
            );

            await s3Client.send(
              new DeleteObjectCommand({ Bucket: bucket, Key: s3Key })
            );

            console.log(`✅ Deleted: ${s3Key.split("/").pop()}`);
          } catch (error: any) {
            if (error.name === "NoSuchKey" || error.Code === "NoSuchKey") {
              console.log(`⏭️ Already deleted: ${s3Key.split("/").pop()}`);
            } else {
              throw error;
            }
          }
        }
      }

      await prisma.recordingSession.update({
        where: { id: session.id },
        data: { status: "deleted" },
      });

      console.log(`✅ Session ${session.recordingNumber} marked as deleted`);
      deletedCount++;
      continue;
    }

    if (session.status === "incomplete") {
      if (files.length === 0) {
        console.warn(
          `⚠️ No files for session ${session.recordingNumber} - skipping`
        );
        continue;
      }

      console.log(`📦 Organizing session ${session.recordingNumber}`);
      console.log(`   Files: ${files.length}`);

      for (const s3Key of files) {
        const participantMatch = s3Key.match(/separate(\d+)/);
        const participantNumber = participantMatch ? participantMatch[1] : "1";

        const newKey = `${meetingName}/recording-${session.recordingNumber}/participant-${participantNumber}.m4a`;

        console.log(
          `   ${s3Key.split("/").pop()} → recording-${
            session.recordingNumber
          }/participant-${participantNumber}.m4a`
        );

        await s3Client.send(
          new CopyObjectCommand({
            Bucket: bucket,
            CopySource: encodeURIComponent(`${bucket}/${s3Key}`),
            Key: newKey,
          })
        );

        await s3Client.send(
          new DeleteObjectCommand({ Bucket: bucket, Key: s3Key })
        );

        const timestamp = extractTimestampFromS3Key(s3Key);
        await prisma.recording.create({
          data: {
            meetingName,
            recordingNumber: session.recordingNumber,
            participantNumber: parseInt(participantNumber),
            recordingStartTime:
              timestamp || new Date(session.recordingStartTime),
            s3Key: newKey,
            s3Url: `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${newKey}`,
            status: "completed",
          },
        });

        console.log(`✅ Saved to database`);
      }

      await prisma.recordingSession.update({
        where: { id: session.id },
        data: { status: "completed" },
      });

      console.log(`✅ Session ${session.recordingNumber} completed`);
      processedCount++;
    }
  }

  await recordingQueue.client.del(`webhook:directories:${meetingName}`);
  console.log(`🗑️ Cleaned up webhook directory data`);

  await prisma.$disconnect();

  return {
    success: true,
    sessionsProcessed: processedCount,
    sessionsDeleted: deletedCount,
    totalFiles: allFiles.length,
    directoriesProcessed: directories.length,
  };
});

recordingQueue.on("completed", (job: any, result: any) => {
  console.log(`✅ Job ${job.id} completed:`, result);
  console.log(`   Sessions processed: ${result.sessionsProcessed}`);
  console.log(`   Sessions deleted: ${result.sessionsDeleted}`);
  console.log(`   Total files: ${result.totalFiles}`);
});

recordingQueue.on("failed", (job: any, err: any) => {
  console.error(
    `❌ Job ${job.id} failed after ${job.attemptsMade} attempts:`,
    err.message
  );

  if (job.attemptsMade >= 10) {
    console.error(`🚨 CRITICAL: Job ${job.id} permanently failed`);
  }
});

recordingQueue.on("stalled", (job: any) => {
  console.warn(`⚠️ Job ${job.id} stalled`);
});
