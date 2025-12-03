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

// export const handleZoomWebhook: RequestHandler = async (req, res) => {
//   try {
//     const { event, payload } = req.body;

//     if (event === "endpoint.url_validation") {
//       const plainToken = payload?.plainToken;
//       if (plainToken) {
//         const crypto = require("crypto");
//         const hash = crypto
//           .createHmac("sha256", process.env.ZOOM_WEBHOOK_SECRET_TOKEN || "")
//           .update(plainToken)
//           .digest("hex");

//         return res.status(200).json({
//           plainToken: plainToken,
//           encryptedToken: hash,
//         });
//       }
//     }

//     if (event !== "session.recording_completed") {
//       return res.status(200).json({ message: "Event ignored", event });
//     }

//     const meetingName = payload?.object?.session_name;
//     const participantAudioFiles = payload?.object?.participant_audio_files;

//     if (
//       !meetingName ||
//       !participantAudioFiles ||
//       participantAudioFiles.length === 0
//     ) {
//       return res.status(400).json({ message: "Invalid payload" });
//     }

//     // ✅ Respond immediately to Zoom
//     res
//       .status(200)
//       .json({ message: "Webhook received, processing in background" });

//     // ✅ Process recordings in the background (don't block webhook response)
//     processRecordingsAsync(meetingName, participantAudioFiles).catch(
//       (error) => {
//         console.error("Error processing recordings:", error);
//       }
//     );
//   } catch (error) {
//     console.error("Webhook error:", error);
//     if (!res.headersSent) {
//       return res.status(500).json({ message: "Internal server error" });
//     }
//   }
// };

// // ✅ Helper function to wait for file to exist in S3
// const waitForS3File = async (
//   s3Key: string,
//   maxWaitMinutes: number = 30
// ): Promise<boolean> => {
//   const maxWaitTime = maxWaitMinutes * 60 * 1000;
//   const startTime = Date.now();
//   const checkInterval = 30000; // Check every 30 seconds

//   while (Date.now() - startTime < maxWaitTime) {
//     try {
//       // Check if file exists using HeadObject (doesn't download the file)
//       const headCommand = new HeadObjectCommand({
//         Bucket: BUCKET_NAME,
//         Key: s3Key,
//       });

//       await s3Client.send(headCommand);

//       console.log(`✅ File exists in S3: ${s3Key}`);
//       return true;
//     } catch (error: any) {
//       if (error.name === "NotFound" || error.Code === "NoSuchKey") {
//         const elapsedMinutes = Math.round((Date.now() - startTime) / 60000);
//         console.log(
//           `⏳ Waiting for file... (${elapsedMinutes} min elapsed): ${s3Key}`
//         );
//         await new Promise((resolve) => setTimeout(resolve, checkInterval));
//       } else {
//         console.error(`Error checking file existence: ${error}`);
//         throw error;
//       }
//     }
//   }

//   throw new Error(
//     `File not available after ${maxWaitMinutes} minutes: ${s3Key}`
//   );
// };

// // ✅ Process recordings asynchronously
// const processRecordingsAsync = async (
//   meetingName: string,
//   participantAudioFiles: any[]
// ) => {
//   try {
//     // Group by recording start time
//     const groupedByRecording = new Map<string, any[]>();
//     for (const file of participantAudioFiles) {
//       const recordingStart = file.recording_start;
//       if (!groupedByRecording.has(recordingStart)) {
//         groupedByRecording.set(recordingStart, []);
//       }
//       groupedByRecording.get(recordingStart)!.push(file);
//     }

//     // Get all sessions from database
//     const allSessions = await prisma.recordingSession.findMany({
//       where: { meetingName },
//       orderBy: { recordingNumber: "asc" },
//     });

//     // Process each recording group
//     for (const [recordingStartStr, files] of groupedByRecording.entries()) {
//       const recordingStartTime = new Date(recordingStartStr);

//       // Find matching session
//       const matchingSession = allSessions.find((session) => {
//         const timeDiff = Math.abs(
//           session.recordingStartTime.getTime() - recordingStartTime.getTime()
//         );
//         return timeDiff < 5000;
//       });

//       if (!matchingSession) {
//         console.warn(
//           `No matching session found for recording at ${recordingStartStr}`
//         );
//         continue;
//       }

//       // Handle interrupted recordings
//       if (matchingSession.status === "interrupted") {
//         console.log(
//           `Deleting interrupted recording ${matchingSession.recordingNumber}`
//         );

//         // ✅ Wait for files before trying to delete them
//         for (const fileInfo of files) {
//           try {
//             const externalUrl = fileInfo.external_storage_url;
//             const s3Key = externalUrl.replace(`s3://${BUCKET_NAME}/`, "");

//             // Wait up to 30 minutes for file to exist
//             const fileExists = await waitForS3File(s3Key, 30);

//             if (fileExists) {
//               const deleteCommand = new DeleteObjectCommand({
//                 Bucket: BUCKET_NAME,
//                 Key: s3Key,
//               });

//               await s3Client.send(deleteCommand);
//               console.log(`✅ Deleted interrupted file: ${s3Key}`);
//             }
//           } catch (error) {
//             console.error(`Failed to delete interrupted recording:`, error);
//             // Continue with next file even if this one fails
//           }
//         }

//         await prisma.recordingSession.update({
//           where: { id: matchingSession.id },
//           data: { status: "deleted" },
//         });

//         continue;
//       }

//       // ✅ Process normal recordings - wait for files first
//       for (const fileInfo of files) {
//         try {
//           const externalUrl = fileInfo.external_storage_url;
//           const s3Key = externalUrl.replace(`s3://${BUCKET_NAME}/`, "");

//           // ✅ CRITICAL: Wait for file to exist before processing
//           console.log(`⏳ Waiting for file to be uploaded: ${s3Key}`);
//           const fileExists = await waitForS3File(s3Key, 30);

//           if (!fileExists) {
//             console.error(`File never became available: ${s3Key}`);
//             continue;
//           }

//           const participantMatch = s3Key.match(/separate(\d+)/);
//           const participantNumber = participantMatch
//             ? participantMatch[1]
//             : "1";

//           const newKey = `${meetingName}/recording-${matchingSession.recordingNumber}/participant-${participantNumber}.m4a`;

//           // Copy file to new location
//           const copyCommand = new CopyObjectCommand({
//             Bucket: BUCKET_NAME,
//             CopySource: encodeURIComponent(`${BUCKET_NAME}/${s3Key}`),
//             Key: newKey,
//           });
//           await s3Client.send(copyCommand);
//           console.log(`✅ Copied file: ${s3Key} → ${newKey}`);

//           // Delete original file
//           const deleteCommand = new DeleteObjectCommand({
//             Bucket: BUCKET_NAME,
//             Key: s3Key,
//           });
//           await s3Client.send(deleteCommand);
//           console.log(`✅ Deleted original file: ${s3Key}`);

//           // Save to database
//           await prisma.recording.create({
//             data: {
//               meetingName,
//               recordingNumber: matchingSession.recordingNumber,
//               participantNumber: parseInt(participantNumber),
//               recordingStartTime: recordingStartTime,
//               s3Key: newKey,
//               s3Url: `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${newKey}`,
//               status: "completed",
//             },
//           });
//           console.log(`✅ Saved recording to database: ${newKey}`);
//         } catch (error) {
//           console.error(`Error processing file:`, error);
//           // Continue with next file even if this one fails
//         }
//       }

//       // Mark session as completed
//       await prisma.recordingSession.update({
//         where: { id: matchingSession.id },
//         data: { status: "completed" },
//       });
//       console.log(
//         `✅ Session ${matchingSession.recordingNumber} marked as completed`
//       );
//     }
//   } catch (error) {
//     console.error("Error in processRecordingsAsync:", error);
//   } finally {
//     await prisma.$disconnect();
//   }
// };

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

const getAudioDuration = (filePath: string): Promise<number> => {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);

    let output = "";
    let errorOutput = "";

    ffprobe.stdout.on("data", (data) => {
      output += data.toString();
    });

    ffprobe.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    ffprobe.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe failed: ${errorOutput}`));
      } else {
        const duration = parseFloat(output.trim());
        resolve(duration); // Duration in seconds
      }
    });

    ffprobe.on("error", (err) => {
      reject(err);
    });
  });
};

const downloadFileFromS3 = async (
  s3Key: string,
  localPath: string
): Promise<void> => {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key,
  });

  const response = await s3Client.send(command);
  const stream = response.Body as Readable;
  const writeStream = createWriteStream(localPath);

  return new Promise((resolve, reject) => {
    stream.pipe(writeStream);
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
  });
};

const getAllS3FilesForSession = async (
  sessionUuid: string,
  meetingDate: string
): Promise<string[]> => {
  const dateMatch = meetingDate.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!dateMatch) return [];

  const [_, year, month, day] = dateMatch;
  const prefix = `cmr/byos/${year}/${month}/${day}/${sessionUuid}/cmr_byos/`;

  console.log(`🔍 Searching S3 with prefix: ${prefix}`);

  const command = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: prefix,
  });

  const response = await s3Client.send(command);
  const files =
    response.Contents?.map((obj) => obj.Key!).filter((key) =>
      key.endsWith(".m4a")
    ) || [];

  console.log(`📦 Found ${files.length} files in S3`);
  return files;
};

interface FileMetadata {
  s3Key: string;
  timestamp: Date;
  durationSeconds: number;
}

const getFileMetadata = async (s3Key: string): Promise<FileMetadata | null> => {
  const timestamp = extractTimestampFromS3Key(s3Key);
  if (!timestamp) {
    console.warn(`⚠️ Could not extract timestamp from: ${s3Key}`);
    return null;
  }

  // Download file temporarily to get duration
  const tempDir = "/tmp";
  const fileName = s3Key.split("/").pop()!;
  const localPath = join(tempDir, fileName);

  try {
    console.log(`⬇️ Downloading ${fileName} to get duration...`);
    await downloadFileFromS3(s3Key, localPath);

    const durationSeconds = await getAudioDuration(localPath);

    console.log(
      `✅ ${fileName}: ${timestamp.toISOString()}, duration: ${Math.round(
        durationSeconds
      )}s`
    );

    unlinkSync(localPath);

    return {
      s3Key,
      timestamp,
      durationSeconds,
    };
  } catch (error) {
    console.error(`❌ Error getting metadata for ${s3Key}:`, error);

    try {
      unlinkSync(localPath);
    } catch {}
    return null;
  }
};

// ✅ Helper: Match files to sessions using timestamp + duration
const matchFilesToSession = (
  filesMetadata: FileMetadata[],
  session: any,
  participantCount: number
): { matched: FileMetadata[]; isComplete: boolean } => {
  const sessionStart = session.recordingStartTime;
  const sessionEnd = session.recordingEndTime;

  if (!sessionEnd) {
    console.warn(
      `⚠️ Session ${session.recordingNumber} has no end time, cannot match`
    );
    return { matched: [], isComplete: false };
  }

  // Calculate expected session duration (in seconds)
  const sessionDurationMs = sessionEnd.getTime() - sessionStart.getTime();
  const sessionDurationSeconds = Math.round(sessionDurationMs / 1000);

  console.log(`📊 Session ${session.recordingNumber}:`);
  console.log(`   Start: ${sessionStart.toISOString()}`);
  console.log(`   End: ${sessionEnd.toISOString()}`);
  console.log(`   Expected duration: ${sessionDurationSeconds}s`);

  const matchedFiles: FileMetadata[] = [];

  // ✅ Tolerances
  const startToleranceSeconds = 30; // File can start within ±30s of session start
  const durationToleranceSeconds = 10; // Duration can differ by ±10s

  for (const file of filesMetadata) {
    // Check 1: Does file start around the session start time?
    const startDiff = Math.abs(
      (file.timestamp.getTime() - sessionStart.getTime()) / 1000
    );

    // Check 2: Does file duration match session duration?
    const durationDiff = Math.abs(
      file.durationSeconds - sessionDurationSeconds
    );

    console.log(`   Checking file: ${file.s3Key.split("/").pop()}`);
    console.log(`      Start time diff: ${Math.round(startDiff)}s`);
    console.log(`      Duration: ${Math.round(file.durationSeconds)}s`);
    console.log(`      Duration diff: ${Math.round(durationDiff)}s`);

    // ✅ Match if BOTH conditions are met:
    // 1. File starts within tolerance of session start
    // 2. File duration matches session duration
    if (
      startDiff <= startToleranceSeconds &&
      durationDiff <= durationToleranceSeconds
    ) {
      matchedFiles.push(file);
      console.log(`      ✅ MATCHED!`);
    } else {
      console.log(`      ❌ No match`);
      if (startDiff > startToleranceSeconds) {
        console.log(`         Reason: Start time too different`);
      }
      if (durationDiff > durationToleranceSeconds) {
        console.log(`         Reason: Duration too different`);
      }
    }
  }

  const isComplete = matchedFiles.length === participantCount;

  console.log(
    `📊 Result: ${matchedFiles.length}/${participantCount} files matched (${
      isComplete ? "COMPLETE ✅" : "INCOMPLETE ⚠️"
    })`
  );

  return { matched: matchedFiles, isComplete };
};

const recordingQueue = new Queue("zoom-recordings", {
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
  },
  defaultJobOptions: {
    attempts: 30,
    backoff: {
      type: "exponential",
      delay: 60000,
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
    const sessionUuid = payload?.object?.recording_files[0].id;
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
    console.log(`   Session UUID: ${sessionUuid}`);

    const firstFile = participantAudioFiles[0];
    const firstFileUrl = firstFile.external_storage_url;
    const firstS3Key = firstFileUrl.replace(`s3://${BUCKET_NAME}/`, "");
    const firstFileTimestamp = extractTimestampFromS3Key(firstS3Key);

    if (!firstFileTimestamp) {
      return res.status(400).json({ message: "Invalid file format" });
    }

    const meetingDate = firstFileTimestamp.toISOString().split("T")[0];

    const allSessions = await prisma.recordingSession.findMany({
      where: { meetingName },
      orderBy: { recordingNumber: "asc" },
    });

    const participantCount = allSessions[0]?.participantCount || 2;
    const expectedTotalFiles = allSessions.length * participantCount;

    await recordingQueue.add(
      "process-meeting",
      {
        meetingName,
        sessionUuid,
        meetingDate,
        expectedTotalFiles,
        participantCount,
        allSessions: allSessions.map((s) => ({
          id: s.id,
          recordingNumber: s.recordingNumber,
          recordingStartTime: s.recordingStartTime.toISOString(),
          recordingEndTime: s.recordingEndTime?.toISOString() || null,
          status: s.status,
        })),
      },
      {
        jobId: `${meetingName}-${Date.now()}`,
        delay: 120000,
      }
    );

    console.log(`✅ Queued processing job`);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

recordingQueue.process("process-meeting", async (job: any) => {
  const {
    meetingName,
    sessionUuid,
    meetingDate,
    expectedTotalFiles,
    participantCount,
    allSessions,
  } = job.data;

  console.log(`📥 Processing meeting: ${meetingName}`);
  console.log(`   Attempt: ${job.attemptsMade + 1}`);

  const allS3Files = await getAllS3FilesForSession(sessionUuid, meetingDate);

  console.log(`📦 Files in S3: ${allS3Files.length}/${expectedTotalFiles}`);

  if (allS3Files.length < expectedTotalFiles) {
    throw new Error(
      `Incomplete: ${allS3Files.length}/${expectedTotalFiles} files ready`
    );
  }

  console.log(`✅ All files ready, analyzing durations...`);

  const filesMetadata: FileMetadata[] = [];
  for (const s3Key of allS3Files) {
    const metadata = await getFileMetadata(s3Key);
    if (metadata) {
      filesMetadata.push(metadata);
    }
  }

  console.log(`✅ Got metadata for ${filesMetadata.length} files`);

  const sessionFileMap = new Map<number, FileMetadata[]>();

  for (const sessionData of allSessions) {
    const session = {
      ...sessionData,
      recordingStartTime: new Date(sessionData.recordingStartTime),
      recordingEndTime: sessionData.recordingEndTime
        ? new Date(sessionData.recordingEndTime)
        : null,
    };

    const { matched, isComplete } = matchFilesToSession(
      filesMetadata,
      session,
      participantCount
    );

    if (matched.length > 0) {
      sessionFileMap.set(session.recordingNumber, matched);
    }
  }

  console.log(`📊 Matched ${sessionFileMap.size} sessions with files`);

  for (const sessionData of allSessions) {
    const files = sessionFileMap.get(sessionData.recordingNumber) || [];

    if (files.length === 0) {
      console.warn(`⚠️ No files for session ${sessionData.recordingNumber}`);
      continue;
    }

    if (sessionData.status === "interrupted") {
      console.log(
        `🗑️ Deleting interrupted recording ${sessionData.recordingNumber}`
      );

      for (const file of files) {
        try {
          await s3Client.send(
            new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: file.s3Key })
          );
          console.log(`✅ Deleted: ${file.s3Key}`);
        } catch (error: any) {
          if (error.name === "NoSuchKey") {
            console.log(`⏭️ Already deleted: ${file.s3Key}`);
          } else {
            throw error;
          }
        }
      }

      await prisma.recordingSession.update({
        where: { id: sessionData.id },
        data: { status: "deleted" },
      });

      continue;
    }

    console.log(
      `📦 Processing session ${sessionData.recordingNumber} (${files.length} files)`
    );

    for (const file of files) {
      const participantMatch = file.s3Key.match(/separate(\d+)/);
      const participantNumber = participantMatch ? participantMatch[1] : "1";

      const newKey = `${meetingName}/recording-${sessionData.recordingNumber}/participant-${participantNumber}.m4a`;

      await s3Client.send(
        new CopyObjectCommand({
          Bucket: BUCKET_NAME,
          CopySource: encodeURIComponent(`${BUCKET_NAME}/${file.s3Key}`),
          Key: newKey,
        })
      );

      await s3Client.send(
        new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: file.s3Key })
      );

      await prisma.recording.create({
        data: {
          meetingName,
          recordingNumber: sessionData.recordingNumber,
          participantNumber: parseInt(participantNumber),
          recordingStartTime: new Date(sessionData.recordingStartTime),
          s3Key: newKey,
          s3Url: `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${newKey}`,
          status: "completed",
        },
      });

      console.log(`✅ Processed: ${newKey}`);
    }

    await prisma.recordingSession.update({
      where: { id: sessionData.id },
      data: { status: "completed" },
    });
  }

  await prisma.$disconnect();

  return { success: true, sessionsProcessed: sessionFileMap.size };
});

recordingQueue.on("completed", (job: any, result: any) => {
  console.log(`✅ Job ${job.id} completed:`, result);
});

recordingQueue.on("failed", (job: any, err: any) => {
  console.error(`❌ Job ${job.id} failed:`, err.message);
});

recordingQueue.on("stalled", (job: any) => {
  console.warn(`⚠️ Job ${job.id} stalled`);
});
