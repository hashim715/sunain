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

// ✅ Create job queue
const recordingQueue = new Queue("zoom-recordings", {
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
  },
  defaultJobOptions: {
    attempts: 20, // Retry 20 times
    backoff: {
      type: "exponential",
      delay: 60000, // Start with 1 minute, doubles each retry
    },
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 500, // Keep last 500 failed jobs
  },
});

// ✅ Webhook handler - just queue the job
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

    // ✅ Group files by recording start time
    const groupedByRecording = new Map<string, any[]>();
    for (const file of participantAudioFiles) {
      const recordingStart = file.recording_start;
      if (!groupedByRecording.has(recordingStart)) {
        groupedByRecording.set(recordingStart, []);
      }
      groupedByRecording.get(recordingStart)!.push(file);
    }

    // ✅ Queue a job for each recording group
    for (const [recordingStartStr, files] of groupedByRecording.entries()) {
      await recordingQueue.add(
        "process-recording",
        {
          meetingName,
          recordingStartStr,
          files,
        },
        {
          jobId: `${meetingName}-${recordingStartStr}`, // Prevent duplicates
          delay: 120000, // Wait 2 minutes before first attempt
        }
      );

      console.log(`✅ Queued job for recording at ${recordingStartStr}`);
    }

    return res.status(200).json({
      success: true,
      message: `Queued ${groupedByRecording.size} recording(s)`,
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ✅ Process jobs from queue
recordingQueue.process("process-recording", async (job: any) => {
  const { meetingName, recordingStartStr, files } = job.data;

  console.log(`📥 Processing job ${job.id} for ${meetingName}`);

  const recordingStartTime = new Date(recordingStartStr);

  // Find matching session
  const allSessions = await prisma.recordingSession.findMany({
    where: { meetingName },
    orderBy: { recordingNumber: "asc" },
  });

  const matchingSession = allSessions.find((session) => {
    const timeDiff = Math.abs(
      session.recordingStartTime.getTime() - recordingStartTime.getTime()
    );
    return timeDiff < 5000;
  });

  if (!matchingSession) {
    throw new Error(
      `No matching session found for recording at ${recordingStartStr}`
    );
  }

  // Handle interrupted recordings
  if (matchingSession.status === "interrupted") {
    console.log(
      `Deleting interrupted recording ${matchingSession.recordingNumber}`
    );

    for (const fileInfo of files) {
      const externalUrl = fileInfo.external_storage_url;
      const s3Key = externalUrl.replace(`s3://${BUCKET_NAME}/`, "");

      // ✅ Check if file exists (will throw if not, triggering retry)
      await s3Client.send(
        new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key })
      );

      // Delete file
      await s3Client.send(
        new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key })
      );
      console.log(`✅ Deleted: ${s3Key}`);
    }

    await prisma.recordingSession.update({
      where: { id: matchingSession.id },
      data: { status: "deleted" },
    });

    return {
      status: "deleted",
      recordingNumber: matchingSession.recordingNumber,
    };
  }

  // Process normal recordings
  const processedFiles = [];

  for (const fileInfo of files) {
    const externalUrl = fileInfo.external_storage_url;
    const s3Key = externalUrl.replace(`s3://${BUCKET_NAME}/`, "");

    // ✅ Check if file exists (throws NoSuchKey if not, triggering retry)
    await s3Client.send(
      new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key })
    );

    const participantMatch = s3Key.match(/separate(\d+)/);
    const participantNumber = participantMatch ? participantMatch[1] : "1";

    const newKey = `${meetingName}/recording-${matchingSession.recordingNumber}/participant-${participantNumber}.m4a`;

    // Copy file
    await s3Client.send(
      new CopyObjectCommand({
        Bucket: BUCKET_NAME,
        CopySource: encodeURIComponent(`${BUCKET_NAME}/${s3Key}`),
        Key: newKey,
      })
    );

    // Delete original
    await s3Client.send(
      new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key })
    );

    // Save to database
    await prisma.recording.create({
      data: {
        meetingName,
        recordingNumber: matchingSession.recordingNumber,
        participantNumber: parseInt(participantNumber),
        recordingStartTime: recordingStartTime,
        s3Key: newKey,
        s3Url: `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${newKey}`,
        status: "completed",
      },
    });

    processedFiles.push(newKey);
    console.log(`✅ Processed: ${newKey}`);
  }

  // Mark session as completed
  await prisma.recordingSession.update({
    where: { id: matchingSession.id },
    data: { status: "completed" },
  });

  await prisma.$disconnect();

  return {
    status: "completed",
    recordingNumber: matchingSession.recordingNumber,
    files: processedFiles,
  };
});

// ✅ Event handlers
recordingQueue.on("completed", (job: any, result: any) => {
  console.log(`✅ Job ${job.id} completed:`, result);
});

recordingQueue.on("failed", (job: any, err: any) => {
  console.error(
    `❌ Job ${job.id} failed after ${job.attemptsMade} attempts:`,
    err.message
  );

  // Send alert/notification here
  if (job.attemptsMade >= 20) {
    console.error(`🚨 CRITICAL: Job ${job.id} permanently failed`);
    // Send email/slack notification
  }
});

recordingQueue.on("stalled", (job: any) => {
  console.warn(`⚠️ Job ${job.id} stalled`);
});
