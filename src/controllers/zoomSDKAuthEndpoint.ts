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
import { internalServerError, badRequestResponse } from "./errors";
import { prisma } from "../config/postgres";
import {
  S3Client,
  CopyObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import Queue from "bull";
import { spawn } from "child_process";
import { createWriteStream, unlinkSync } from "fs";
import { join } from "path";
import { Readable } from "stream";

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

const BUCKET_NAME = process.env.S3_BUCKET_NAME || "zurons-store-1";

// ✅ Helper: Parse S3 URL from webhook
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

// ✅ Helper: Extract timestamp from S3 filename
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

// ✅ Helper: Get all files from S3 directory
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
      .sort() || []; // Sort alphabetically (separate1, separate2, separate3...)

  console.log(`📦 Found ${files.length} audio files`);
  return files;
};

// ✅ Helper: Group files in order based on participant count
const groupFilesInOrder = (
  files: string[],
  participantCount: number
): string[][] => {
  const groups: string[][] = [];

  // Simply split files into groups of participantCount
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

// ✅ Create job queue
const recordingQueue = new Queue("zoom-recordings", {
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
  },
  defaultJobOptions: {
    attempts: 20,
    backoff: {
      type: "exponential",
      delay: 60000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

// ✅ Webhook handler
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

    // ✅ Get S3 location from first file
    const firstFile = participantAudioFiles[0];
    const parsed = parseS3Url(firstFile.external_storage_url);

    if (!parsed) {
      console.error("❌ Could not parse S3 URL");
      return res.status(400).json({ message: "Invalid S3 URL" });
    }

    // Extract the directory path (everything before cmr_byos/)
    // Example: cmr/byos/2025/12/03/F9E43066-58A5-468A-B6F7-035B9BF5DA81/cmr_byos/
    const s3Directory = parsed.key.substring(
      0,
      parsed.key.lastIndexOf("/") + 1
    );

    console.log(`📁 S3 Directory: ${parsed.bucket}/${s3Directory}`);

    // Get all sessions from database
    const allSessions = await prisma.recordingSession.findMany({
      where: { meetingName },
      orderBy: { recordingNumber: "asc" },
    });

    if (allSessions.length === 0) {
      console.error("❌ No sessions found in database");
      return res.status(404).json({ message: "No sessions found" });
    }

    console.log(`💾 Found ${allSessions.length} sessions in database`);

    const participantCount = allSessions[0]?.participantCount || 2;
    const expectedTotalFiles = allSessions.length * participantCount;

    console.log(
      `📊 Expected: ${expectedTotalFiles} files (${allSessions.length} sessions × ${participantCount} participants)`
    );

    // Queue processing job
    await recordingQueue.add(
      "process-meeting",
      {
        meetingName,
        bucket: parsed.bucket,
        s3Directory,
        participantCount,
        expectedTotalFiles,
        allSessions: allSessions.map((s) => ({
          id: s.id,
          recordingNumber: s.recordingNumber,
          status: s.status,
          recordingStartTime: s.recordingStartTime.toISOString(),
        })),
      },
      {
        jobId: `${meetingName}-${Date.now()}`,
        delay: 120000, // Wait 2 minutes before first attempt
      }
    );

    console.log(`✅ Queued processing job`);

    return res.status(200).json({
      success: true,
      message: "Processing queued",
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ✅ Process jobs from queue
recordingQueue.process("process-meeting", async (job: any) => {
  const {
    meetingName,
    bucket,
    s3Directory,
    participantCount,
    expectedTotalFiles,
    allSessions,
  } = job.data;

  console.log(`📥 Processing meeting: ${meetingName}`);
  console.log(`   Attempt: ${job.attemptsMade + 1}`);
  console.log(`   Directory: ${bucket}/${s3Directory}`);

  // ✅ Get all files from S3 directory
  const allFiles = await getAllFilesFromS3Directory(bucket, s3Directory);

  console.log(`📦 Files in S3: ${allFiles.length}/${expectedTotalFiles}`);

  // ✅ Wait for all files to be uploaded
  if (allFiles.length < expectedTotalFiles) {
    const missing = expectedTotalFiles - allFiles.length;
    console.log(`⏳ Waiting for ${missing} more file(s)...`);
    throw new Error(
      `Incomplete: ${allFiles.length}/${expectedTotalFiles} files ready`
    );
  }

  console.log(`✅ All ${expectedTotalFiles} files are ready!`);

  // ✅ Group files in order (each group = one recording session)
  const fileGroups = groupFilesInOrder(allFiles, participantCount);

  if (fileGroups.length !== allSessions.length) {
    console.warn(
      `⚠️ File group count (${fileGroups.length}) doesn't match session count (${allSessions.length})`
    );
  }

  // ✅ Process each session
  for (let i = 0; i < allSessions.length; i++) {
    const session = allSessions[i];
    const files = fileGroups[i] || [];

    if (files.length === 0) {
      console.warn(`⚠️ No files for session ${session.recordingNumber}`);
      continue;
    }

    console.log(
      `📦 Processing session ${session.recordingNumber} (${session.status})`
    );
    console.log(`   Files: ${files.length}`);

    // ✅ Handle interrupted recordings - DELETE
    if (session.status === "interrupted") {
      console.log(
        `🗑️ Deleting interrupted recording ${session.recordingNumber}`
      );

      for (const s3Key of files) {
        try {
          // Check if file exists
          await s3Client.send(
            new HeadObjectCommand({ Bucket: bucket, Key: s3Key })
          );

          // Delete file
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

      // Update database
      await prisma.recordingSession.update({
        where: { id: session.id },
        data: { status: "deleted" },
      });

      console.log(`✅ Session ${session.recordingNumber} marked as deleted`);
      continue;
    }

    // ✅ Handle normal recordings - ORGANIZE
    console.log(`📦 Organizing session ${session.recordingNumber}`);

    for (const s3Key of files) {
      // Extract participant number from filename (separate1, separate2, etc.)
      const participantMatch = s3Key.match(/separate(\d+)/);
      const participantNumber = participantMatch ? participantMatch[1] : "1";

      // New organized path
      const newKey = `${meetingName}/recording-${session.recordingNumber}/participant-${participantNumber}.m4a`;

      console.log(
        `   ${s3Key.split("/").pop()} → recording-${
          session.recordingNumber
        }/participant-${participantNumber}.m4a`
      );

      // Copy to new location
      await s3Client.send(
        new CopyObjectCommand({
          Bucket: bucket,
          CopySource: encodeURIComponent(`${bucket}/${s3Key}`),
          Key: newKey,
        })
      );

      // Delete original
      await s3Client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: s3Key })
      );

      // Save to database
      const timestamp = extractTimestampFromS3Key(s3Key);
      await prisma.recording.create({
        data: {
          meetingName,
          recordingNumber: session.recordingNumber,
          participantNumber: parseInt(participantNumber),
          recordingStartTime: timestamp || new Date(session.recordingStartTime),
          s3Key: newKey,
          s3Url: `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${newKey}`,
          status: "completed",
        },
      });

      console.log(`✅ Saved to database`);
    }

    // Mark session as completed
    await prisma.recordingSession.update({
      where: { id: session.id },
      data: { status: "completed" },
    });

    console.log(`✅ Session ${session.recordingNumber} completed`);
  }

  await prisma.$disconnect();

  return {
    success: true,
    sessionsProcessed: allSessions.length,
    totalFiles: allFiles.length,
  };
});

// ✅ Event handlers
recordingQueue.on("completed", (job: any, result: any) => {
  console.log(`✅ Job ${job.id} completed:`, result);
  console.log(`   Sessions processed: ${result.sessionsProcessed}`);
  console.log(`   Total files: ${result.totalFiles}`);
});

recordingQueue.on("failed", (job: any, err: any) => {
  console.error(
    `❌ Job ${job.id} failed after ${job.attemptsMade} attempts:`,
    err.message
  );

  if (job.attemptsMade >= 20) {
    console.error(`🚨 CRITICAL: Job ${job.id} permanently failed`);
    // Send notification
  }
});

recordingQueue.on("stalled", (job: any) => {
  console.warn(`⚠️ Job ${job.id} stalled`);
});
