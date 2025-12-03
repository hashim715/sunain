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

// ✅ Helper function to extract timestamp from S3 filename
const extractTimestampFromS3Key = (s3Key: string): Date | null => {
  // Example: cmr/byos/2025/12/03/UUID/cmr_byos/GMT20251203-085910_Recording_separate2.m4a
  //                                                       ^^^^^^^^^^^^^^
  const match = s3Key.match(/GMT(\d{8})-(\d{6})/);
  if (match) {
    const dateStr = match[1]; // 20251203
    const timeStr = match[2]; // 085910

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

// ✅ Webhook handler - match files to sessions individually
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

    console.log("🔍 WEBHOOK PAYLOAD ANALYSIS:");
    console.log(`Total files in webhook: ${participantAudioFiles.length}`);

    // ✅ Get all sessions from database
    const allSessions = await prisma.recordingSession.findMany({
      where: { meetingName },
      orderBy: { recordingNumber: "asc" },
    });

    console.log(
      `💾 Found ${allSessions.length} sessions in database for ${meetingName}`
    );
    allSessions.forEach((session) => {
      console.log(
        `  Recording ${
          session.recordingNumber
        }: ${session.recordingStartTime.toISOString()} (${session.status})`
      );
    });

    // ✅ Group files by matching them to sessions using S3 filename timestamps
    const sessionFiles = new Map<number, any[]>(); // recordingNumber -> files

    for (const file of participantAudioFiles) {
      const externalUrl = file.external_storage_url;
      const s3Key = externalUrl.replace(`s3://${BUCKET_NAME}/`, "");

      // Extract timestamp from S3 filename (more accurate than recording_start)
      const fileTimestamp = extractTimestampFromS3Key(s3Key);

      if (!fileTimestamp) {
        console.warn(`⚠️ Could not extract timestamp from: ${s3Key}`);
        console.warn(
          `   Using webhook recording_start: ${file.recording_start}`
        );
        // Fallback to webhook timestamp
        const fallbackTimestamp = new Date(file.recording_start);

        // Try to match with fallback
        const matchingSession = allSessions.find((session) => {
          const timeDiff = Math.abs(
            session.recordingStartTime.getTime() - fallbackTimestamp.getTime()
          );
          return timeDiff < 60000; // Within 1 minute
        });

        if (matchingSession) {
          if (!sessionFiles.has(matchingSession.recordingNumber)) {
            sessionFiles.set(matchingSession.recordingNumber, []);
          }
          sessionFiles.get(matchingSession.recordingNumber)!.push({
            ...file,
            s3Key,
          });
        }
        continue;
      }

      console.log(`📄 File: ${file.file_name}`);
      console.log(`   Webhook timestamp: ${file.recording_start}`);
      console.log(`   S3 filename timestamp: ${fileTimestamp.toISOString()}`);

      // Find matching session based on file timestamp
      const matchingSession = allSessions.find((session) => {
        const timeDiff = Math.abs(
          session.recordingStartTime.getTime() - fileTimestamp.getTime()
        );
        return timeDiff < 60000; // Within 1 minute
      });

      if (!matchingSession) {
        console.warn(
          `❌ No session found for file at ${fileTimestamp.toISOString()}`
        );
        console.warn(`   File: ${s3Key}`);
        console.warn(
          `   Available sessions:`,
          allSessions.map((s) => ({
            number: s.recordingNumber,
            time: s.recordingStartTime.toISOString(),
          }))
        );
        continue;
      }

      console.log(`✅ Matched to Recording ${matchingSession.recordingNumber}`);

      // Group by session
      if (!sessionFiles.has(matchingSession.recordingNumber)) {
        sessionFiles.set(matchingSession.recordingNumber, []);
      }
      sessionFiles.get(matchingSession.recordingNumber)!.push({
        ...file,
        s3Key,
      });
    }

    console.log("📊 Files grouped by session:");
    for (const [recordingNumber, files] of sessionFiles.entries()) {
      const session = allSessions.find(
        (s) => s.recordingNumber === recordingNumber
      );
      console.log(
        `  Recording ${recordingNumber} (${session?.status}): ${files.length} file(s)`
      );
      files.forEach((f) => console.log(`    - ${f.file_name} → ${f.s3Key}`));
    }

    // ✅ Queue a job for each session with its matched files
    let queuedJobs = 0;
    for (const [recordingNumber, files] of sessionFiles.entries()) {
      const session = allSessions.find(
        (s) => s.recordingNumber === recordingNumber
      );

      if (!session) {
        console.warn(
          `⚠️ Session ${recordingNumber} not found in database, skipping`
        );
        continue;
      }

      await recordingQueue.add(
        "process-recording",
        {
          meetingName,
          recordingNumber: session.recordingNumber,
          sessionId: session.id,
          status: session.status,
          recordingStartTime: session.recordingStartTime.toISOString(),
          files,
        },
        {
          jobId: `${meetingName}-recording-${recordingNumber}`, // Prevent duplicates
          delay: 120000, // Wait 2 minutes before first attempt
        }
      );

      console.log(
        `✅ Queued job for recording ${recordingNumber} with ${files.length} file(s)`
      );
      queuedJobs++;
    }

    return res.status(200).json({
      success: true,
      message: `Queued ${queuedJobs} recording(s)`,
      details: {
        totalFiles: participantAudioFiles.length,
        sessionsFound: allSessions.length,
        jobsQueued: queuedJobs,
      },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ✅ Process jobs from queue
recordingQueue.process("process-recording", async (job: any) => {
  const { meetingName, recordingNumber, sessionId, status, files } = job.data;

  console.log(`📥 Processing job ${job.id}`);
  console.log(`   Meeting: ${meetingName}`);
  console.log(`   Recording: ${recordingNumber}`);
  console.log(`   Status: ${status}`);
  console.log(`   Files: ${files.length}`);

  // Handle interrupted recordings
  if (status === "interrupted") {
    console.log(`🗑️ Deleting interrupted recording ${recordingNumber}`);

    for (const fileInfo of files) {
      const s3Key = fileInfo.s3Key;

      try {
        // ✅ Check if file exists (will throw if not, triggering retry)
        await s3Client.send(
          new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key })
        );

        // Delete file
        await s3Client.send(
          new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key })
        );
        console.log(`✅ Deleted: ${s3Key}`);
      } catch (error: any) {
        if (error.name === "NoSuchKey" || error.Code === "NoSuchKey") {
          console.log(`⏭️ File already deleted or doesn't exist: ${s3Key}`);
          // Continue - file is already gone
        } else {
          throw error; // Re-throw other errors to trigger retry
        }
      }
    }

    await prisma.recordingSession.update({
      where: { id: sessionId },
      data: { status: "deleted" },
    });

    return {
      status: "deleted",
      recordingNumber: recordingNumber,
    };
  }

  // Process normal recordings
  const processedFiles = [];

  for (const fileInfo of files) {
    const s3Key = fileInfo.s3Key;

    // ✅ Check if file exists (throws NoSuchKey if not, triggering retry)
    await s3Client.send(
      new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key })
    );

    const participantMatch = s3Key.match(/separate(\d+)/);
    const participantNumber = participantMatch ? participantMatch[1] : "1";

    const newKey = `${meetingName}/recording-${recordingNumber}/participant-${participantNumber}.m4a`;

    console.log(`📦 Processing: ${s3Key} → ${newKey}`);

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
        recordingNumber: recordingNumber,
        participantNumber: parseInt(participantNumber),
        recordingStartTime: new Date(job.data.recordingStartTime),
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
    where: { id: sessionId },
    data: { status: "completed" },
  });

  await prisma.$disconnect();

  return {
    status: "completed",
    recordingNumber: recordingNumber,
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
