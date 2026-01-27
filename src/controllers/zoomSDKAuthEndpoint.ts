// import { toStringArray } from "../utils/zoomSdkAuthEndpointUtils";
// import {
//   inNumberArray,
//   isBetween,
//   isLengthLessThan,
//   isRequired,
//   matchesStringArray,
//   validateRequest,
//   isValidPasscode,
// } from "../utils/zoomSDKAuthEndpointValidations";
// import dotenv from "dotenv";
// import { KJUR } from "jsrsasign";
// import { Request, Response, NextFunction, RequestHandler } from "express";
// import { logger } from "../utils/logger";
// import { internalServerError } from "./errors";
// import { prisma } from "../config/postgres";
// import {
//   S3Client,
//   CopyObjectCommand,
//   DeleteObjectCommand,
//   ListObjectsV2Command,
//   HeadObjectCommand,
// } from "@aws-sdk/client-s3";
// import Queue from "bull";
// import axios from "axios";

// dotenv.config();

// const validator = {
//   role: [isRequired, inNumberArray([0, 1])],
//   sessionName: [isRequired, isLengthLessThan(200)],
//   expirationSeconds: isBetween(1800, 172800),
//   userIdentity: isLengthLessThan(35),
//   sessionKey: isLengthLessThan(36),
//   geoRegions: matchesStringArray([
//     "AU",
//     "BR",
//     "CA",
//     "CN",
//     "DE",
//     "HK",
//     "IN",
//     "JP",
//     "MX",
//     "NL",
//     "SG",
//     "US",
//   ]),
//   cloudRecordingOption: inNumberArray([0, 1]),
//   cloudRecordingElection: inNumberArray([0, 1]),
//   videoWebRtcMode: inNumberArray([0, 1]),
//   audioCompatibleMode: inNumberArray([0, 1]),
//   audioWebRtcMode: inNumberArray([0, 1]),
//   passcode: isValidPasscode,
// };

// const coerceRequestBody = (body: any): any => ({
//   ...body,
//   ...[
//     "role",
//     "expirationSeconds",
//     "cloudRecordingOption",
//     "cloudRecordingElection",
//     "videoWebRtcMode",
//     "audioCompatibleMode",
//     "audioWebRtcMode",
//   ].reduce(
//     (acc, cur) => ({
//       ...acc,
//       [cur]: typeof body[cur] === "string" ? parseInt(body[cur]) : body[cur],
//     }),
//     {}
//   ),

//   ...(body.passcode && { passcode: body.passcode.trim() }),
// });

// const joinGeoRegions = (geoRegions: any): string | undefined =>
//   toStringArray(geoRegions)?.join(",");

// export const generateZoomSignature: RequestHandler = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   try {
//     if (!process.env.ZOOM_VIDEO_SDK_KEY || !process.env.ZOOM_VIDEO_SDK_SECRET) {
//       logger.error(
//         "Zoom SDK credentials not configured in environment variables"
//       );
//       return res.status(500).json({
//         success: false,
//         message: "Zoom SDK credentials not configured",
//       });
//     }

//     const requestBody = coerceRequestBody(req.body);
//     const validationErrors = validateRequest(requestBody, validator);

//     if (validationErrors.length > 0) {
//       return res.status(400).json({ message: validationErrors });
//     }

//     const {
//       role,
//       sessionName,
//       expirationSeconds,
//       userIdentity,
//       sessionKey,
//       geoRegions,
//       cloudRecordingOption,
//       cloudRecordingElection,
//       telemetryTrackingId,
//       videoWebRtcMode,
//       audioCompatibleMode,
//       audioWebRtcMode,
//       passcode,
//     } = requestBody;

//     const iat = Math.floor(Date.now() / 1000);
//     const exp = expirationSeconds ? iat + expirationSeconds : iat + 60 * 60 * 2;
//     const oHeader = { alg: "HS256", typ: "JWT" };

//     const oPayload = {
//       app_key: process.env.ZOOM_VIDEO_SDK_KEY,
//       role_type: role,
//       tpc: sessionName,
//       version: 1,
//       iat,
//       exp,
//       user_identity: userIdentity,
//       session_key: sessionKey,
//       geo_regions: joinGeoRegions(geoRegions),
//       cloud_recording_option: cloudRecordingOption,
//       cloud_recording_election: cloudRecordingElection,
//       telemetry_tracking_id: telemetryTrackingId,
//       video_webrtc_mode: videoWebRtcMode,
//       audio_webrtc_mode: audioWebRtcMode ?? audioCompatibleMode,
//       password: passcode,
//     };

//     const sHeader = JSON.stringify(oHeader);
//     const sPayload = JSON.stringify(oPayload);

//     const secretKey = process.env.ZOOM_VIDEO_SDK_SECRET as string;
//     const sdkJWT = KJUR.jws.JWS.sign("HS256", sHeader, sPayload, secretKey);

//     return res.status(200).json({ signature: sdkJWT });
//   } catch (err) {
//     logger.error(`Error generating Zoom signature: ${err}`);
//     if (!res.headersSent) {
//       return internalServerError(res);
//     }
//   } finally {
//     await prisma.$disconnect();
//   }
// };

// const s3Client = new S3Client({
//   credentials: {
//     accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
//     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
//   },
//   region: process.env.AWS_REGION || "us-east-2",
// });

// const parseS3Url = (
//   externalStorageUrl: string
// ): { bucket: string; key: string } | null => {
//   const match = externalStorageUrl.match(/^s3:\/\/([^\/]+)\/(.+)$/);

//   if (match) {
//     return {
//       bucket: match[1],
//       key: match[2],
//     };
//   }

//   return null;
// };

// const extractTimestampFromS3Key = (s3Key: string): Date | null => {
//   const match = s3Key.match(/GMT(\d{8})-(\d{6})/);

//   if (match) {
//     const dateStr = match[1];
//     const timeStr = match[2];

//     const year = dateStr.substring(0, 4);
//     const month = dateStr.substring(4, 6);
//     const day = dateStr.substring(6, 8);
//     const hour = timeStr.substring(0, 2);
//     const minute = timeStr.substring(2, 4);
//     const second = timeStr.substring(4, 6);

//     return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
//   }

//   return null;
// };

// const getAllFilesFromS3Directory = async (
//   bucket: string,
//   prefix: string
// ): Promise<string[]> => {
//   console.log(`🔍 Listing files in S3: ${bucket}/${prefix}`);

//   const command = new ListObjectsV2Command({
//     Bucket: bucket,
//     Prefix: prefix,
//   });

//   const response = await s3Client.send(command);
//   const files =
//     response.Contents?.map((obj) => obj.Key!)
//       .filter((key) => key.endsWith(".m4a"))
//       .sort() || [];

//   console.log(`📦 Found ${files.length} audio files`);
//   return files;
// };

// const getAllFilesFromMultipleDirectories = async (
//   bucket: string,
//   directories: string[]
// ): Promise<string[]> => {
//   console.log(`🔍 Searching ${directories.length} S3 directories...`);

//   const allFiles: string[] = [];

//   for (const directory of directories) {
//     const files = await getAllFilesFromS3Directory(bucket, directory);
//     allFiles.push(...files);
//   }

//   console.log(`📦 Total files across all directories: ${allFiles.length}`);
//   return allFiles.sort();
// };

// const groupFilesInOrder = (
//   files: string[],
//   participantCount: number
// ): string[][] => {
//   const groups: string[][] = [];

//   for (let i = 0; i < files.length; i += participantCount) {
//     const group = files.slice(i, i + participantCount);
//     groups.push(group);
//   }

//   console.log(
//     `📊 Grouped ${files.length} files into ${groups.length} sessions`
//   );
//   groups.forEach((group, index) => {
//     console.log(`   Session ${index + 1}: ${group.length} files`);
//     group.forEach((file) => {
//       const timestamp = extractTimestampFromS3Key(file);
//       console.log(
//         `      - ${file.split("/").pop()} (${timestamp?.toISOString()})`
//       );
//     });
//   });

//   return groups;
// };

// interface WebhookDirectories {
//   meetingName: string;
//   bucket: string;
//   directories: string[];
//   lastUpdated: number;
// }
// interface ZoomFileMapping {
//   fileName: string;
//   username: string;
//   timestamp: string;
//   separateNumber: string;
// }

// interface WebhookZoomFiles {
//   meetingName: string;
//   fileMappings: ZoomFileMapping[];
//   lastUpdated: number;
// }

// const storeWebhookDirectory = async (
//   meetingName: string,
//   bucket: string,
//   directory: string
// ): Promise<string[]> => {
//   const redisKey = `webhook:directories:${meetingName}`;

//   const existingData = await recordingQueue.client.get(redisKey);

//   let directories: string[] = [];

//   if (existingData) {
//     const parsed: WebhookDirectories = JSON.parse(existingData);
//     directories = parsed.directories;

//     if (!directories.includes(directory)) {
//       directories.push(directory);
//       console.log(`📁 Added new directory for meeting ${meetingName}`);
//     } else {
//       console.log(`⚠️ Directory already tracked, skipping`);
//     }
//   } else {
//     directories = [directory];
//     console.log(`📁 First directory for meeting ${meetingName}`);
//   }

//   const data: WebhookDirectories = {
//     meetingName,
//     bucket,
//     directories,
//     lastUpdated: Date.now(),
//   };

//   await recordingQueue.client.setex(redisKey, 172800, JSON.stringify(data));

//   console.log(`💾 Stored ${directories.length} directories for ${meetingName}`);

//   return directories;
// };

// const storeZoomUserMapping = async (
//   meetingName: string,
//   participantAudioFiles: any[]
// ): Promise<ZoomFileMapping[]> => {
//   const redisKey = `webhook:zoom:files:${meetingName}`;

//   const existingData = await recordingQueue.client.get(redisKey);

//   let fileMappings: ZoomFileMapping[] = [];

//   const newMappings: ZoomFileMapping[] = participantAudioFiles.map(
//     (file: any) => {
//       const separateMatch =
//         file.file_name?.match(/separate(\d+)/) ||
//         file.external_storage_url?.match(/separate(\d+)/);
//       const separateNumber = separateMatch ? separateMatch[1] : "";

//       const timestampMatch =
//         file.file_name?.match(/GMT(\d{8}-\d{6})/) ||
//         file.external_storage_url?.match(/GMT(\d{8}-\d{6})/);
//       const timestamp = timestampMatch ? timestampMatch[1] : "";

//       return {
//         fileName: file.file_name || "",
//         username: file.file_name.split("/")[0].replace("Audio only - ", ""),
//         timestamp,
//         separateNumber,
//       };
//     }
//   );

//   if (existingData) {
//     const parsed: WebhookZoomFiles = JSON.parse(existingData);
//     fileMappings = parsed.fileMappings;

//     for (const newMapping of newMappings) {
//       const existingMapping = fileMappings.find(
//         (m) =>
//           m.timestamp === newMapping.timestamp &&
//           m.separateNumber === newMapping.separateNumber
//       );

//       if (!existingMapping) {
//         fileMappings.push(newMapping);
//         console.log(
//           `📎 Added file mapping: ${newMapping.fileName} → User ${newMapping.username}`
//         );
//       } else {
//         console.log(
//           `⚠️ File mapping already exists: ${newMapping.fileName}, skipping`
//         );
//       }
//     }
//   } else {
//     fileMappings = newMappings;
//     console.log(
//       `📎 First file mappings for meeting ${meetingName} (${fileMappings.length} files)`
//     );
//   }

//   const data: WebhookZoomFiles = {
//     meetingName,
//     fileMappings,
//     lastUpdated: Date.now(),
//   };

//   await recordingQueue.client.setex(redisKey, 172800, JSON.stringify(data));

//   console.log(
//     `💾 Stored ${fileMappings.length} file-to-user mappings for ${meetingName}`
//   );
//   fileMappings.forEach((mapping, index) => {
//     console.log(
//       `   ${index + 1}. ${mapping.fileName} (separate${
//         mapping.separateNumber
//       }) → User ${mapping.username}`
//     );
//   });

//   return fileMappings;
// };

// export const recordingQueue = new Queue("zoom-recordings", {
//   redis: {
//     host: process.env.REDIS_HOST || "localhost",
//     port: parseInt(process.env.REDIS_PORT || "6379"),
//   },
//   defaultJobOptions: {
//     attempts: 10,
//     backoff: {
//       type: "fixed",
//       delay: 120000,
//     },
//     removeOnComplete: 100,
//     removeOnFail: 500,
//   },
// });

// export const transcriptQueue = new Queue("transcript-processing", {
//   redis: {
//     host: process.env.REDIS_HOST || "localhost",
//     port: parseInt(process.env.REDIS_PORT || "6379"),
//   },
//   defaultJobOptions: {
//     attempts: 5,
//     backoff: { type: "exponential", delay: 300000 },
//     removeOnComplete: 50,
//     removeOnFail: 200,
//     timeout: 1800000,
//   },
// });

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

//     console.log("🔍 WEBHOOK RECEIVED");
//     console.log(`   Meeting: ${meetingName}`);
//     console.log(`   Files reported: ${participantAudioFiles.length}`);

//     const firstFile = participantAudioFiles[0];
//     const parsed = parseS3Url(firstFile.external_storage_url);

//     if (!parsed) {
//       console.error("❌ Could not parse S3 URL");
//       return res.status(400).json({ message: "Invalid S3 URL" });
//     }

//     const s3Directory = parsed.key.substring(
//       0,
//       parsed.key.lastIndexOf("/") + 1
//     );

//     console.log(`📁 S3 Directory: ${parsed.bucket}/${s3Directory}`);

//     const allDirectories = await storeWebhookDirectory(
//       meetingName,
//       parsed.bucket,
//       s3Directory
//     );

//     const allZoomUsers = await storeZoomUserMapping(
//       meetingName,
//       participantAudioFiles
//     );

//     const pendingSessions = await prisma.recordingSession.findMany({
//       where: {
//         meetingName,
//         status: {
//           in: ["incomplete", "interrupted"],
//         },
//       },
//       orderBy: { recordingNumber: "asc" },
//     });

//     if (pendingSessions.length === 0) {
//       console.log("✅ No pending sessions - all recordings already processed");
//       return res.status(200).json({
//         message: "No pending sessions to process",
//       });
//     }

//     console.log(
//       `💾 Found ${pendingSessions.length} pending sessions in database`
//     );
//     pendingSessions.forEach((session) => {
//       console.log(`   - Session ${session.recordingNumber}: ${session.status}`);
//     });

//     const participantCount = pendingSessions[0]?.participantCount || 2;

//     const expectedTotalFiles = pendingSessions.length * participantCount;

//     const incompleteCount = pendingSessions.filter(
//       (s) => s.status === "incomplete"
//     ).length;
//     const interruptedCount = pendingSessions.filter(
//       (s) => s.status === "interrupted"
//     ).length;

//     console.log(`📊 Expected: ${expectedTotalFiles} files total`);
//     console.log(`   - ${incompleteCount} incomplete sessions (will be saved)`);
//     console.log(
//       `   - ${interruptedCount} interrupted sessions (will be deleted)`
//     );
//     console.log(`   - ${participantCount} participants per session`);

//     const existingJobs = await recordingQueue.getJobs([
//       "waiting",
//       "delayed",
//       "active",
//     ]);

//     for (const job of existingJobs) {
//       if (job.data.meetingName === meetingName) {
//         console.log(`🗑️ Removing old job: ${job.id}`);
//         await job.remove();
//       }
//     }

//     await recordingQueue.add(
//       "process-meeting",
//       {
//         meetingName,
//         bucket: parsed.bucket,
//         directories: allDirectories,
//       },
//       {
//         jobId: `${meetingName}-${Date.now()}`,
//         delay: 120000,
//       }
//     );

//     console.log(
//       `✅ Queued processing job with ${allDirectories.length} directories`
//     );

//     return res.status(200).json({
//       success: true,
//       message: "Processing queued",
//       pendingSessions: pendingSessions.length,
//       directories: allDirectories.length,
//       zoomUsers: allZoomUsers.length,
//     });
//   } catch (error) {
//     console.error("Webhook error:", error);
//     return res.status(500).json({ message: "Internal server error" });
//   }
// };

// const mapZoomUserToDbUser = async (
//   username: string
// ): Promise<number | null> => {
//   try {
//     const user = await prisma.user.findUnique({
//       where: { username: username },
//     });

//     if (!user) {
//       console.error(`User not found`);
//       return null;
//     }

//     if (user) {
//       return user.id;
//     }

//     console.warn(`⚠️ Could not find user with that username: ${username}`);
//     return null;
//   } catch (error) {
//     console.error("Error mapping Zoom user:", error);
//     return null;
//   }
// };

// function calculateAge(dateOfBirth: string) {
//   const normalizedDate = dateOfBirth.replace(/\//g, "-");

//   const today = new Date();
//   const birthDate = new Date(normalizedDate);

//   let age = today.getFullYear() - birthDate.getFullYear();
//   const monthDiff = today.getMonth() - birthDate.getMonth();

//   if (
//     monthDiff < 0 ||
//     (monthDiff === 0 && today.getDate() < birthDate.getDate())
//   ) {
//     age--;
//   }

//   return age;
// }

// recordingQueue.process("process-meeting", async (job: any) => {
//   const { meetingName, bucket, directories } = job.data;

//   console.log(`📥 Processing meeting: ${meetingName}`);
//   console.log(`   Attempt: ${job.attemptsMade + 1}`);
//   console.log(`   Directories: ${directories.length}`);
//   directories.forEach((dir: string, i: number) => {
//     console.log(`      ${i + 1}. ${dir}`);
//   });

//   const meeting = await prisma.meeting.findUnique({
//     where: { sessionName: meetingName },
//     include: {
//       participants: true,
//     },
//   });

//   const dialects = meeting.participants.map((p) => p.dialect || "Unknown");

//   const zoomFilesKey = `webhook:zoom:files:${meetingName}`;
//   const zoomFilesData = await recordingQueue.client.get(zoomFilesKey);

//   let fileMappings: ZoomFileMapping[] = [];

//   if (zoomFilesData) {
//     const parsed: WebhookZoomFiles = JSON.parse(zoomFilesData);
//     fileMappings = parsed.fileMappings;
//   } else {
//     console.warn(`⚠️ No file mappings found for meeting ${meetingName}`);
//   }

//   const pendingSessions = await prisma.recordingSession.findMany({
//     where: {
//       meetingName,
//       status: {
//         in: ["incomplete", "interrupted"],
//       },
//     },
//     orderBy: { recordingNumber: "asc" },
//   });

//   if (pendingSessions.length === 0) {
//     console.log("✅ No pending sessions found - all already processed");

//     await recordingQueue.client.del(`webhook:directories:${meetingName}`);

//     return {
//       success: true,
//       message: "All sessions already processed",
//       sessionsProcessed: 0,
//       sessionsDeleted: 0,
//     };
//   }

//   console.log(`💾 Found ${pendingSessions.length} pending sessions`);
//   pendingSessions.forEach((session) => {
//     console.log(`   - Session ${session.recordingNumber}: ${session.status}`);
//   });

//   const participantCount = pendingSessions[0]?.participantCount || 2;

//   const expectedTotalFiles = pendingSessions.length * participantCount;

//   const incompleteCount = pendingSessions.filter(
//     (s) => s.status === "incomplete"
//   ).length;
//   const interruptedCount = pendingSessions.filter(
//     (s) => s.status === "interrupted"
//   ).length;

//   console.log(`📊 Expected: ${expectedTotalFiles} files total`);
//   console.log(
//     `   - ${incompleteCount} incomplete sessions × ${participantCount} = ${
//       incompleteCount * participantCount
//     } files to save`
//   );
//   console.log(
//     `   - ${interruptedCount} interrupted sessions × ${participantCount} = ${
//       interruptedCount * participantCount
//     } files to delete`
//   );

//   const allFiles = await getAllFilesFromMultipleDirectories(
//     bucket,
//     directories
//   );

//   console.log(`📦 Files in S3: ${allFiles.length}/${expectedTotalFiles}`);

//   if (allFiles.length < expectedTotalFiles) {
//     const missing = expectedTotalFiles - allFiles.length;
//     console.log(`⏳ Waiting for ${missing} more file(s)...`);
//     throw new Error(
//       `Incomplete: ${allFiles.length}/${expectedTotalFiles} files ready`
//     );
//   }

//   console.log(`✅ All ${expectedTotalFiles} files are ready!`);

//   const fileGroups = groupFilesInOrder(allFiles, participantCount);

//   let processedCount = 0;
//   let deletedCount = 0;

//   for (let i = 0; i < pendingSessions.length; i++) {
//     const session = pendingSessions[i];
//     const files = fileGroups[i] || [];

//     console.log(
//       `📦 Processing session ${session.recordingNumber} (${session.status})`
//     );

//     if (session.status === "interrupted") {
//       console.log(
//         `🗑️ Deleting interrupted recording ${session.recordingNumber}`
//       );

//       if (files.length > 0) {
//         for (const s3Key of files) {
//           try {
//             await s3Client.send(
//               new HeadObjectCommand({ Bucket: bucket, Key: s3Key })
//             );

//             await s3Client.send(
//               new DeleteObjectCommand({ Bucket: bucket, Key: s3Key })
//             );

//             console.log(`✅ Deleted: ${s3Key.split("/").pop()}`);
//           } catch (error: any) {
//             if (error.name === "NoSuchKey" || error.Code === "NoSuchKey") {
//               console.log(`⏭️ Already deleted: ${s3Key.split("/").pop()}`);
//             } else {
//               throw error;
//             }
//           }
//         }
//       }

//       await prisma.recordingSession.update({
//         where: { id: session.id },
//         data: { status: "deleted" },
//       });

//       console.log(`✅ Session ${session.recordingNumber} marked as deleted`);
//       deletedCount++;
//       continue;
//     }

//     if (session.status === "incomplete") {
//       if (files.length === 0) {
//         console.warn(
//           `⚠️ No files for session ${session.recordingNumber} - skipping`
//         );
//         continue;
//       }

//       console.log(`📦 Organizing session ${session.recordingNumber}`);
//       console.log(`   Files: ${files.length}`);

//       const now = new Date();
//       const folderName = now
//         .toLocaleString("en-CA", {
//           timeZone: "America/Los_Angeles",
//           year: "numeric",
//           month: "2-digit",
//           day: "2-digit",
//           hour: "2-digit",
//           minute: "2-digit",
//           hour12: true,
//         })
//         .replace(/,/g, "")
//         .replace(/\s+/g, "-")
//         .toLowerCase();

//       const folder_name = folderName;
//       //const folder_name = new Date().toISOString();

//       for (const s3Key of files) {
//         const participantMatch = s3Key.match(/separate(\d+)/);
//         const participantNumber = participantMatch ? participantMatch[1] : "1";

//         const timestampMatch = s3Key.match(/GMT(\d{8}-\d{6})/);
//         const timestamp = timestampMatch ? timestampMatch[1] : "";

//         const matchedMapping = fileMappings.find(
//           (mapping) =>
//             mapping.timestamp === timestamp &&
//             mapping.separateNumber === participantNumber
//         );

//         let username: string | null = null;

//         if (matchedMapping) {
//           username = matchedMapping.username;
//           console.log(
//             `✅ Matched file: separate${participantNumber} → User ${username}`
//           );
//         } else {
//           console.warn(
//             `⚠️ Could not match file separate${participantNumber} (timestamp: ${timestamp}) to Zoom user`
//           );
//         }

//         const newKey = `${meeting.language}/${folder_name}/recording-${session.recordingNumber}/participant-${participantNumber}.m4a`;

//         console.log(
//           `   ${s3Key.split("/").pop()} → recording-${
//             session.recordingNumber
//           }/participant-${participantNumber}.m4a`
//         );

//         await s3Client.send(
//           new CopyObjectCommand({
//             Bucket: bucket,
//             CopySource: encodeURIComponent(`${bucket}/${s3Key}`),
//             Key: newKey,
//           })
//         );

//         await s3Client.send(
//           new DeleteObjectCommand({ Bucket: bucket, Key: s3Key })
//         );

//         let dbUserId: number | null = null;

//         if (username) {
//           dbUserId = await mapZoomUserToDbUser(username);
//         }

//         const extractedTimestamp = extractTimestampFromS3Key(s3Key);

//         const recording = await prisma.recording.create({
//           data: {
//             meetingName,
//             recordingNumber: session.recordingNumber,
//             participantNumber: parseInt(participantNumber),
//             recordingStartTime:
//               extractedTimestamp || new Date(session.recordingStartTime),
//             s3Key: newKey,
//             s3Url: `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${newKey}`,
//             status: "completed",
//             userId: dbUserId,
//           },
//         });

//         const conversation = await prisma.conversation.create({
//           data: {
//             meetingId: meeting.id,
//             userId: dbUserId,
//             recordingId: recording.id,
//             participantDialects: dialects,
//             duration: 0.0,
//             quality: 0.0,
//             earnings: 0.0,
//             status: "incomplete",
//             notes: `Conversation recording ${session.recordingNumber}`,
//             startTime: session.recordingStartTime,
//             endTime: session.recordingEndTime || new Date(),
//           },
//         });

//         console.log(`✅ Saved to database`);
//       }

//       await prisma.recordingSession.update({
//         where: { id: session.id },
//         data: { status: "completed" },
//       });

//       console.log(`✅ Session ${session.recordingNumber} completed`);

//       await transcriptQueue.add(
//         "process-transcripts",
//         {
//           meetingName: meetingName,
//           recordingNumber: session.recordingNumber,
//           folder_name: folder_name,
//           sessionId: session.id,
//         },
//         {
//           jobId: `transcript-${meetingName}-${session.recordingNumber}`,
//           priority: 1,
//         }
//       );

//       console.log(
//         `🎯 Queued transcript processing for session ${session.recordingNumber}`
//       );

//       processedCount++;
//     }
//   }

//   await recordingQueue.client.del(`webhook:directories:${meetingName}`);
//   await recordingQueue.client.del(zoomFilesKey);
//   console.log(`🗑️ Cleaned up webhook data`);

//   await prisma.$disconnect();

//   return {
//     success: true,
//     sessionsProcessed: processedCount,
//     sessionsDeleted: deletedCount,
//     totalFiles: allFiles.length,
//     directoriesProcessed: directories.length,
//   };
// });

// recordingQueue.on("completed", (job: any, result: any) => {
//   console.log(`✅ Job ${job.id} completed:`, result);
//   console.log(`   Sessions processed: ${result.sessionsProcessed}`);
//   console.log(`   Sessions deleted: ${result.sessionsDeleted}`);
//   console.log(`   Total files: ${result.totalFiles}`);
// });

// recordingQueue.on("failed", (job: any, err: any) => {
//   console.error(
//     `❌ Job ${job.id} failed after ${job.attemptsMade} attempts:`,
//     err.message
//   );

//   if (job.attemptsMade >= 10) {
//     console.error(`🚨 CRITICAL: Job ${job.id} permanently failed`);
//   }
// });

// recordingQueue.on("stalled", (job: any) => {
//   console.warn(`⚠️ Job ${job.id} stalled`);
// });

// const API_BASE_URL = "http://0.0.0.0:8000";
// const HOURLY_RATE = 16;
// const SECONDS_PER_HOUR = 3600;
// const NGROK_HEADERS = { "ngrok-skip-browser-warning": "true" };

// const callAPI = async (endpoint: string, data: any) => {
//   try {
//     const response = await axios.post(`${API_BASE_URL}${endpoint}`, data, {
//       headers: NGROK_HEADERS,
//     });
//     return response.data;
//   } catch (error) {
//     throw new Error(`API call failed [${endpoint}]: ${error.message}`);
//   }
// };

// const calculateEarnings = (durationSeconds: number): number => {
//   return (durationSeconds / SECONDS_PER_HOUR) * HOURLY_RATE;
// };

// const processConversation = async (
//   recording: any,
//   meetingName: string,
//   language: string,
//   recordingNumber: number,
//   speakerQuality: number,
//   flagging: boolean,
//   flaggin_reasons: string[],
//   totalDuration: number,
//   folder_name: string,
//   disconnections: Record<number, any[]>,
//   initialOffsets: Record<number, number>
// ) => {
//   const conversation = await prisma.conversation.findFirst({
//     where: { recordingId: recording.id },
//     include: { user: true },
//   });

//   if (!conversation) {
//     console.warn(`⚠️  No conversation found for recording ${recording.id}`);
//     return;
//   }

//   const currentMeeting = await prisma.meeting.findUnique({
//     where: { id: conversation.meetingId },
//     include: {
//       participants: {
//         select: { userId: true },
//       },
//     },
//   });

//   const userIds = currentMeeting.participants.map((p) => p.userId);
//   const userId1 = userIds[0];
//   const userId2 = userIds[1];

//   const previousMeetings = await prisma.meeting.findMany({
//     where: {
//       id: { not: currentMeeting.id },
//       participants: {
//         every: {
//           userId: { in: [userId1, userId2] },
//         },
//       },
//       conversations: {
//         some: {
//           status: "completed",
//           flagged_status: false,
//         },
//       },
//     },
//     include: {
//       _count: {
//         select: {
//           conversations: {
//             where: {
//               status: "completed",
//               flagged_status: false,
//             },
//           },
//         },
//       },
//       participants: {
//         where: {
//           userId: { in: [userId1, userId2] },
//         },
//       },
//     },
//   });

//   const validMeetings = previousMeetings.filter(
//     (meeting) =>
//       meeting.participants.length === 2 && meeting._count.conversations > 0
//   );

//   const count = validMeetings.length;

//   const participantDisconnections =
//     disconnections[recording.participantNumber] || [];
//   const participantInitialOffset =
//     initialOffsets[recording.participantNumber] || 0; // ✅ GET OFFSET

//   const metadata = await callAPI("/save-metadata", {
//     s3_folder_path: `${language}/${folder_name}/recording-${recordingNumber}`,
//     gender: conversation.user.gender,
//     speaker_number: recording.participantNumber,
//     age: calculateAge(conversation.user.date_of_birth),
//     dialect: conversation.user.language_dialect,
//     conversationNumber: count + 1,
//     userId: conversation.userId,
//     disconnections: participantDisconnections,
//     initialOffset: participantInitialOffset, // ✅ SEND OFFSET
//   });

//   if (totalDuration <= 500) {
//     await prisma.conversation.update({
//       where: { id: conversation.id },
//       data: {
//         quality: Math.random() * (0.85 - 0.8) + 0.8,
//         duration: totalDuration,
//         earnings: calculateEarnings(totalDuration),
//         flagged_status: true,
//         flagged_reasons: flaggin_reasons,
//         status: "incomplete",
//       },
//     });
//   } else {
//     await prisma.conversation.update({
//       where: { id: conversation.id },
//       data: {
//         quality: Math.random() * (0.85 - 0.8) + 0.8,
//         duration: totalDuration,
//         earnings: calculateEarnings(totalDuration),
//         flagged_status: false,
//         flagged_reasons: flaggin_reasons,
//         status: "completed",
//       },
//     });
//   }

//   console.log(
//     `✅ Updated conversation for participant ${recording.participantNumber}`
//   );
// };

// transcriptQueue.process("process-transcripts", async (job: any) => {
//   const {
//     meetingName,
//     recordingNumber,
//     folder_name,
//     sessionId,
//     disconnections,
//     initialOffsets,
//   } = job.data;

//   console.log(`📥 Processing transcripts: ${meetingName}`);
//   console.log(`📥 Recording Number: recording-${recordingNumber}`);
//   console.log(`   Attempt: ${job.attemptsMade + 1}`);

//   const meeting = await prisma.meeting.findUnique({
//     where: { sessionName: meetingName },
//   });

//   if (!meeting) {
//     throw new Error(`Meeting not found: ${meetingName}`);
//   }

//   const s3FolderPath = `${meeting.language}/${folder_name}/recording-${recordingNumber}`;

//   console.log("🎙️  Step 1: Transcribing audio...");
//   await callAPI("/transcribe", {
//     language: meeting.language,
//     s3_folder_path: s3FolderPath,
//   });
//   console.log("✅ Transcription complete");

//   console.log("📊 Step 2: Analyzing quality...");
//   const qualityData = await callAPI("/analyze-quality", {
//     language: meeting.language,
//     s3_transcript_path: `${s3FolderPath}/transcription.txt`,
//   });
//   console.log("✅ Quality analysis complete");

//   console.log("Step 3: Flagging the conversation...");
//   const flagging_response = await callAPI("/flag-filter", {
//     s3_transcript_path: `${s3FolderPath}/transcription.txt`,
//     s3_quality_scores_path: `${s3FolderPath}/quality_scores.json`,
//     language: meeting.language,
//     check_similarity: false,
//   });
//   console.log("✅ flagging of coversation completed");

//   console.log("👥 Step 4: Processing conversations...");
//   const recordings = await prisma.recording.findMany({
//     where: {
//       meetingName: meetingName,
//       recordingNumber: recordingNumber,
//     },
//   });

//   await Promise.all(
//     recordings.map((recording) => {
//       const speakerKey = `speaker_${recording.participantNumber}`;
//       const speakerQuality = qualityData.speakers[speakerKey]?.final_score;
//       const totalDuration = qualityData.conversation_duration;

//       if (!speakerQuality) {
//         console.warn(`⚠️  No quality score for ${speakerKey}`);
//         return Promise.resolve();
//       }

//       return processConversation(
//         recording,
//         meetingName,
//         meeting.language,
//         recordingNumber,
//         speakerQuality,
//         flagging_response.should_flag,
//         flagging_response.reasons,
//         totalDuration,
//         folder_name,
//         disconnections,
//         initialOffsets
//       );
//     })
//   );

//   console.log("🎙️  Step 5: Merging audio to conversation.wav...");
//   await callAPI("/merge-audio", {
//     s3_folder_path: s3FolderPath,
//   });
//   console.log("✅ Audio merging completed");

//   console.log("✅ All conversations processed successfully");

//   return {
//     success: true,
//     message: "All processes completed successfully",
//     processedRecordings: recordings.length,
//   };
// });

// transcriptQueue.on("completed", (job: any, result: any) => {
//   console.log(`✅ Transcript job ${job.id} completed:`, result);
// });

// transcriptQueue.on("failed", (job: any, err: any) => {
//   console.error(
//     `❌ Transcript job ${job.id} failed after ${job.attemptsMade} attempts:`,
//     err.message
//   );

//   if (job.attemptsMade >= 5) {
//     console.error(`🚨 CRITICAL: Job ${job.id} permanently failed`);
//   }
// });

// transcriptQueue.on("progress", (job: any, progress: number) => {
//   console.log(`⏳ Transcript job ${job.id} progress: ${progress}%`);
// });

// transcriptQueue.on("stalled", (job: any) => {
//   console.warn(`⚠️ Job ${job.id} stalled`);
// });

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
import axios from "axios";

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

// const parseS3Url = (
//   externalStorageUrl: string
// ): { bucket: string; key: string } | null => {
//   const match = externalStorageUrl.match(/^s3:\/\/([^\/]+)\/(.+)$/);

//   if (match) {
//     return {
//       bucket: match[1],
//       key: match[2],
//     };
//   }

//   return null;
// };

// const extractTimestampFromS3Key = (s3Key: string): Date | null => {
//   const match = s3Key.match(/GMT(\d{8})-(\d{6})/);

//   if (match) {
//     const dateStr = match[1];
//     const timeStr = match[2];

//     const year = dateStr.substring(0, 4);
//     const month = dateStr.substring(4, 6);
//     const day = dateStr.substring(6, 8);
//     const hour = timeStr.substring(0, 2);
//     const minute = timeStr.substring(2, 4);
//     const second = timeStr.substring(4, 6);

//     return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
//   }

//   return null;
// };

// const getAllFilesFromS3Directory = async (
//   bucket: string,
//   prefix: string
// ): Promise<string[]> => {
//   console.log(`🔍 Listing files in S3: ${bucket}/${prefix}`);

//   const command = new ListObjectsV2Command({
//     Bucket: bucket,
//     Prefix: prefix,
//   });

//   const response = await s3Client.send(command);
//   const files =
//     response.Contents?.map((obj) => obj.Key!)
//       .filter((key) => key.endsWith(".m4a"))
//       .sort() || [];

//   console.log(`📦 Found ${files.length} audio files`);
//   return files;
// };

// const getAllFilesFromMultipleDirectories = async (
//   bucket: string,
//   directories: string[]
// ): Promise<string[]> => {
//   console.log(`🔍 Searching ${directories.length} S3 directories...`);

//   const allFiles: string[] = [];

//   for (const directory of directories) {
//     const files = await getAllFilesFromS3Directory(bucket, directory);
//     allFiles.push(...files);
//   }

//   console.log(`📦 Total files across all directories: ${allFiles.length}`);
//   return allFiles.sort();
// };

// const groupFilesInOrder = (
//   files: string[],
//   participantCount: number
// ): string[][] => {
//   const groups: string[][] = [];

//   for (let i = 0; i < files.length; i += participantCount) {
//     const group = files.slice(i, i + participantCount);
//     groups.push(group);
//   }

//   console.log(
//     `📊 Grouped ${files.length} files into ${groups.length} sessions`
//   );
//   groups.forEach((group, index) => {
//     console.log(`   Session ${index + 1}: ${group.length} files`);
//     group.forEach((file) => {
//       const timestamp = extractTimestampFromS3Key(file);
//       console.log(
//         `      - ${file.split("/").pop()} (${timestamp?.toISOString()})`
//       );
//     });
//   });

//   return groups;
// };

// -----------------------------
// Helpers
// -----------------------------
const parseS3Url = (
  externalStorageUrl: string
): { bucket: string; key: string } | null => {
  const match = externalStorageUrl.match(/^s3:\/\/([^\/]+)\/(.+)$/);
  if (!match) return null;
  return { bucket: match[1], key: match[2] };
};

const extractTimestampFromS3Key = (s3Key: string): Date | null => {
  const match = s3Key.match(/GMT(\d{8})-(\d{6})/);
  if (!match) return null;

  const dateStr = match[1];
  const timeStr = match[2];

  const year = dateStr.substring(0, 4);
  const month = dateStr.substring(4, 6);
  const day = dateStr.substring(6, 8);
  const hour = timeStr.substring(0, 2);
  const minute = timeStr.substring(2, 4);
  const second = timeStr.substring(4, 6);

  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
};

// ✅ YOUR Zoom BYOS path format (from your log):
// cmr/byos/2026/01/26/<UUID>/cmr_byos/...
function extractByosInfoFromKey(key: string): {
  basePath: string; // "cmr/byos"
  y: number;
  mo: number;
  d: number;
  uuid: string;
  tail: string; // "cmr_byos/"
} | null {
  const m = key.match(
    /^(.+?)\/(\d{4})\/(\d{2})\/(\d{2})\/([0-9A-Fa-f-]{36})\/([^/]+\/)/
  );
  if (!m) return null;

  return {
    basePath: m[1],
    y: Number(m[2]),
    mo: Number(m[3]),
    d: Number(m[4]),
    uuid: m[5],
    tail: m[6],
  };
}

function shiftUtcYmd(
  y: number,
  mo: number,
  d: number,
  deltaDays: number
): { y: number; mo: number; d: number } {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return {
    y: dt.getUTCFullYear(),
    mo: dt.getUTCMonth() + 1,
    d: dt.getUTCDate(),
  };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

function buildByosPrefix(
  basePath: string,
  y: number,
  mo: number,
  d: number,
  uuid: string,
  tail: string
) {
  return `${basePath}/${y}/${pad2(mo)}/${pad2(d)}/${uuid}/${tail}`;
}

// ✅ Robust ordering: sort by embedded GMT timestamp + separate#
function sortKeyForZoomFile(k: string) {
  const ts = extractTimestampFromS3Key(k)?.getTime() ?? 0;
  const sep = Number(k.match(/separate(\d+)/)?.[1] || "0");
  return `${String(ts).padStart(15, "0")}-${String(sep).padStart(3, "0")}-${k}`;
}

// -----------------------------
// ✅ S3 listing with pagination
// -----------------------------
const getAllFilesFromS3Directory = async (
  bucket: string,
  prefix: string
): Promise<string[]> => {
  console.log(`🔍 Listing files in S3: ${bucket}/${prefix}`);

  let token: string | undefined;
  const files: string[] = [];

  do {
    const resp = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
      })
    );

    (resp.Contents || []).forEach((o) => {
      if (o.Key && o.Key.endsWith(".m4a")) files.push(o.Key);
    });

    token = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (token);

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

  return allFiles.sort((a, b) =>
    sortKeyForZoomFile(a) < sortKeyForZoomFile(b) ? -1 : 1
  );
};

const groupFilesInOrder = (
  files: string[],
  participantCount: number
): string[][] => {
  const groups: string[][] = [];
  for (let i = 0; i < files.length; i += participantCount) {
    groups.push(files.slice(i, i + participantCount));
  }
  return groups;
};

// -----------------------------
// ✅ Redis Root Tracking (NEW)
// -----------------------------
interface WebhookRoot {
  meetingName: string;
  bucket: string;
  basePath: string;
  y: number;
  mo: number;
  d: number;
  uuid: string;
  tail: string;
  lastUpdated: number;
}

async function storeWebhookRoot(
  meetingName: string,
  bucket: string,
  key: string
) {
  const info = extractByosInfoFromKey(key);
  if (!info) {
    throw new Error(`Cannot parse BYOS key: ${key}`);
  }

  const redisKey = `webhook:root:${meetingName}`;

  const data: WebhookRoot = {
    meetingName,
    bucket,
    basePath: info.basePath,
    y: info.y,
    mo: info.mo,
    d: info.d,
    uuid: info.uuid,
    tail: info.tail,
    lastUpdated: Date.now(),
  };

  await recordingQueue.client.setex(redisKey, 172800, JSON.stringify(data));
  console.log(
    `💾 Stored webhook root for ${meetingName}: ${info.basePath}/${
      info.y
    }/${pad2(info.mo)}/${pad2(info.d)}/${info.uuid}/${info.tail}`
  );
  return data;
}

async function getExpandedDirectoriesFromRoot(meetingName: string): Promise<{
  bucket: string;
  directories: string[];
}> {
  const rootKey = `webhook:root:${meetingName}`;
  const raw = await recordingQueue.client.get(rootKey);
  if (!raw) throw new Error(`No webhook root stored for ${meetingName}`);

  const root: WebhookRoot = JSON.parse(raw);

  const dirs = [-1, 0, 1].map((delta) => {
    const shifted = shiftUtcYmd(root.y, root.mo, root.d, delta);
    return buildByosPrefix(
      root.basePath,
      shifted.y,
      shifted.mo,
      shifted.d,
      root.uuid,
      root.tail
    );
  });

  const directories = Array.from(new Set(dirs));
  return { bucket: root.bucket, directories };
}

interface WebhookDirectories {
  meetingName: string;
  bucket: string;
  directories: string[];
  lastUpdated: number;
}
interface ZoomFileMapping {
  fileName: string;
  username: string;
  timestamp: string;
  separateNumber: string;
}

interface WebhookZoomFiles {
  meetingName: string;
  fileMappings: ZoomFileMapping[];
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

const storeZoomUserMapping = async (
  meetingName: string,
  participantAudioFiles: any[]
): Promise<ZoomFileMapping[]> => {
  const redisKey = `webhook:zoom:files:${meetingName}`;

  const existingData = await recordingQueue.client.get(redisKey);

  let fileMappings: ZoomFileMapping[] = [];

  const newMappings: ZoomFileMapping[] = participantAudioFiles.map(
    (file: any) => {
      const separateMatch =
        file.file_name?.match(/separate(\d+)/) ||
        file.external_storage_url?.match(/separate(\d+)/);
      const separateNumber = separateMatch ? separateMatch[1] : "";

      const timestampMatch =
        file.file_name?.match(/GMT(\d{8}-\d{6})/) ||
        file.external_storage_url?.match(/GMT(\d{8}-\d{6})/);
      const timestamp = timestampMatch ? timestampMatch[1] : "";

      return {
        fileName: file.file_name || "",
        username: file.file_name.split("/")[0].replace("Audio only - ", ""),
        timestamp,
        separateNumber,
      };
    }
  );

  if (existingData) {
    const parsed: WebhookZoomFiles = JSON.parse(existingData);
    fileMappings = parsed.fileMappings;

    for (const newMapping of newMappings) {
      const existingMapping = fileMappings.find(
        (m) =>
          m.timestamp === newMapping.timestamp &&
          m.separateNumber === newMapping.separateNumber
      );

      if (!existingMapping) {
        fileMappings.push(newMapping);
        console.log(
          `📎 Added file mapping: ${newMapping.fileName} → User ${newMapping.username}`
        );
      } else {
        console.log(
          `⚠️ File mapping already exists: ${newMapping.fileName}, skipping`
        );
      }
    }
  } else {
    fileMappings = newMappings;
    console.log(
      `📎 First file mappings for meeting ${meetingName} (${fileMappings.length} files)`
    );
  }

  const data: WebhookZoomFiles = {
    meetingName,
    fileMappings,
    lastUpdated: Date.now(),
  };

  await recordingQueue.client.setex(redisKey, 172800, JSON.stringify(data));

  console.log(
    `💾 Stored ${fileMappings.length} file-to-user mappings for ${meetingName}`
  );
  fileMappings.forEach((mapping, index) => {
    console.log(
      `   ${index + 1}. ${mapping.fileName} (separate${
        mapping.separateNumber
      }) → User ${mapping.username}`
    );
  });

  return fileMappings;
};

export const recordingQueue = new Queue("zoom-recordings", {
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
  },
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 5000, // Start at 5 seconds
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

export const transcriptQueue = new Queue("transcript-processing", {
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
  },
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 10000, // Start at 10 seconds
    },
    removeOnComplete: 50,
    removeOnFail: 200,
    timeout: 1800000,
  },
});

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

//     console.log("🔍 WEBHOOK RECEIVED");
//     console.log(`   Meeting: ${meetingName}`);
//     console.log(`   Files reported: ${participantAudioFiles.length}`);

//     const firstFile = participantAudioFiles[0];
//     const parsed = parseS3Url(firstFile.external_storage_url);

//     if (!parsed) {
//       console.error("❌ Could not parse S3 URL");
//       return res.status(400).json({ message: "Invalid S3 URL" });
//     }

//     const s3Directory = parsed.key.substring(
//       0,
//       parsed.key.lastIndexOf("/") + 1
//     );

//     console.log(`📁 S3 Directory: ${parsed.bucket}/${s3Directory}`);

//     const allDirectories = await storeWebhookDirectory(
//       meetingName,
//       parsed.bucket,
//       s3Directory
//     );

//     const allZoomUsers = await storeZoomUserMapping(
//       meetingName,
//       participantAudioFiles
//     );

//     const pendingSessions = await prisma.recordingSession.findMany({
//       where: {
//         meetingName,
//         status: {
//           in: ["incomplete", "interrupted"],
//         },
//       },
//       orderBy: { recordingNumber: "asc" },
//     });

//     if (pendingSessions.length === 0) {
//       console.log("✅ No pending sessions - all recordings already processed");
//       return res.status(200).json({
//         message: "No pending sessions to process",
//       });
//     }

//     console.log(
//       `💾 Found ${pendingSessions.length} pending sessions in database`
//     );
//     pendingSessions.forEach((session) => {
//       console.log(`   - Session ${session.recordingNumber}: ${session.status}`);
//     });

//     const participantCount = pendingSessions[0]?.participantCount || 2;

//     const expectedTotalFiles = pendingSessions.length * participantCount;

//     const incompleteCount = pendingSessions.filter(
//       (s) => s.status === "incomplete"
//     ).length;
//     const interruptedCount = pendingSessions.filter(
//       (s) => s.status === "interrupted"
//     ).length;

//     console.log(`📊 Expected: ${expectedTotalFiles} files total`);
//     console.log(`   - ${incompleteCount} incomplete sessions (will be saved)`);
//     console.log(
//       `   - ${interruptedCount} interrupted sessions (will be deleted)`
//     );
//     console.log(`   - ${participantCount} participants per session`);

//     const existingJobs = await recordingQueue.getJobs([
//       "waiting",
//       "delayed",
//       "active",
//     ]);

//     for (const job of existingJobs) {
//       if (job.data.meetingName === meetingName) {
//         console.log(`🗑️ Removing old job: ${job.id}`);
//         await job.remove();
//       }
//     }

//     await recordingQueue.add(
//       "process-meeting",
//       {
//         meetingName,
//         bucket: parsed.bucket,
//         directories: allDirectories,
//       },
//       {
//         jobId: `${meetingName}-${Date.now()}`,
//         delay: 30000, // Reduce from 2 minutes to 30 seconds
//       }
//     );

//     console.log(
//       `✅ Queued processing job with ${allDirectories.length} directories`
//     );

//     return res.status(200).json({
//       success: true,
//       message: "Processing queued",
//       pendingSessions: pendingSessions.length,
//       directories: allDirectories.length,
//       zoomUsers: allZoomUsers.length,
//     });
//   } catch (error) {
//     console.error("Webhook error:", error);
//     return res.status(500).json({ message: "Internal server error" });
//   }
// };

// -----------------------------
// ✅ Zoom file mapping (keep yours)
// (Paste your existing storeZoomUserMapping() here unchanged)
// -----------------------------

// -----------------------------
// ✅ Webhook Handler (UPDATED)
// -----------------------------
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

    await storeWebhookRoot(meetingName, parsed.bucket, parsed.key);

    const allZoomUsers = await storeZoomUserMapping(
      meetingName,
      participantAudioFiles
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

    await recordingQueue.add(
      "process-meeting",
      { meetingName },
      {
        jobId: `process-meeting:${meetingName}`,
        delay: 30000,
        removeOnComplete: true,
        removeOnFail: false,
      }
    );

    console.log(`✅ Queued processing job (stable) for ${meetingName}`);

    return res.status(200).json({
      success: true,
      message: "Processing queued",
      pendingSessions: pendingSessions.length,
      zoomUsers: allZoomUsers.length,
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const mapZoomUserToDbUser = async (
  username: string
): Promise<number | null> => {
  try {
    const user = await prisma.user.findUnique({
      where: { username: username },
    });

    if (!user) {
      console.error(`User not found`);
      return null;
    }

    if (user) {
      return user.id;
    }

    console.warn(`⚠️ Could not find user with that username: ${username}`);
    return null;
  } catch (error) {
    console.error("Error mapping Zoom user:", error);
    return null;
  }
};

function calculateAge(dateOfBirth: string) {
  const normalizedDate = dateOfBirth.replace(/\//g, "-");

  const today = new Date();
  const birthDate = new Date(normalizedDate);

  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }

  return age;
}

async function acquireLock(
  client: any,
  key: string,
  ttlSeconds: number
): Promise<boolean> {
  try {
    const res = await client.set(key, "1", { NX: true, EX: ttlSeconds });
    return res === "OK";
  } catch {
    const res = await client.set(key, "1", "EX", ttlSeconds, "NX");
    return res === "OK";
  }
}

// -----------------------------
// ✅ Processor (UPDATED)
// - Expands directories D-1/D/D+1 from UUID root
// - Uses a Redis lock to prevent double-processing
// -----------------------------
recordingQueue.process("process-meeting", async (job: any) => {
  const { meetingName } = job.data;

  const lockKey = `lock:process-meeting:${meetingName}`;
  const gotLock = await acquireLock(recordingQueue.client, lockKey, 600);
  if (!gotLock) {
    console.log(`🔒 Already processing ${meetingName}, skipping this run`);
    return { skipped: true };
  }

  if (!gotLock) {
    console.log(`🔒 Already processing ${meetingName}, skipping this run`);
    return { skipped: true };
  }

  try {
    const { bucket, directories } = await getExpandedDirectoriesFromRoot(
      meetingName
    );

    console.log(`📥 Processing meeting: ${meetingName}`);
    console.log(`   Attempt: ${job.attemptsMade + 1}`);
    console.log(`   Directories: ${directories.length}`);
    directories.forEach((dir, i) => console.log(`      ${i + 1}. ${dir}`));

    const meeting = await prisma.meeting.findUnique({
      where: { sessionName: meetingName },
      include: { participants: true },
    });

    if (!meeting) {
      throw new Error(`Meeting not found in DB for sessionName=${meetingName}`);
    }

    const dialects = meeting.participants.map((p) => p.dialect || "Unknown");

    const zoomFilesKey = `webhook:zoom:files:${meetingName}`;
    const zoomFilesData = await recordingQueue.client.get(zoomFilesKey);

    let fileMappings: ZoomFileMapping[] = [];
    if (zoomFilesData) {
      const parsed: WebhookZoomFiles = JSON.parse(zoomFilesData);
      fileMappings = parsed.fileMappings;
    } else {
      console.warn(`⚠️ No file mappings found for meeting ${meetingName}`);
    }

    const pendingSessions = await prisma.recordingSession.findMany({
      where: {
        meetingName,
        status: { in: ["incomplete", "interrupted"] },
      },
      orderBy: { recordingNumber: "asc" },
    });

    if (pendingSessions.length === 0) {
      console.log("✅ No pending sessions found - all already processed");
      await recordingQueue.client.del(`webhook:root:${meetingName}`);
      await recordingQueue.client.del(zoomFilesKey);
      return {
        success: true,
        message: "All sessions already processed",
        sessionsProcessed: 0,
        sessionsDeleted: 0,
      };
    }

    const participantCount = pendingSessions[0]?.participantCount || 2;
    const expectedTotalFiles = pendingSessions.length * participantCount;

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

        await prisma.recordingSession.update({
          where: { id: session.id },
          data: { status: "deleted" },
        });

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

        const meetings_date = meeting.createdAt
          .toLocaleString("en-CA", {
            timeZone: "America/Los_Angeles",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          })
          .replace(/,/g, "")
          .replace(/\s+/g, "-")
          .toLowerCase();

        const ts = meeting.createdAt.getTime();

        const folder_name = `${meetings_date}/${meeting.createdAt
          .toLocaleString("en-CA", {
            timeZone: "America/Los_Angeles",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          })
          .replace(/,/g, "")
          .replace(/\s+/g, "-")
          .toLowerCase()}-${ts}`;

        for (const s3Key of files) {
          const participantMatch = s3Key.match(/separate(\d+)/);
          const participantNumber = participantMatch
            ? participantMatch[1]
            : "1";

          const timestampMatch = s3Key.match(/GMT(\d{8}-\d{6})/);
          const timestamp = timestampMatch ? timestampMatch[1] : "";

          const matchedMapping = fileMappings.find(
            (m) =>
              m.timestamp === timestamp &&
              m.separateNumber === participantNumber
          );

          let username: string | null = null;
          if (matchedMapping) username = matchedMapping.username;

          const newKey = `${meeting.language}/${folder_name}/recording-${session.recordingNumber}/participant-${participantNumber}.m4a`;

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

          let dbUserId: number | null = null;
          if (username) dbUserId = await mapZoomUserToDbUser(username);

          const extractedTimestamp = extractTimestampFromS3Key(s3Key);

          const recording = await prisma.recording.create({
            data: {
              meetingName,
              recordingNumber: session.recordingNumber,
              participantNumber: parseInt(participantNumber),
              recordingStartTime:
                extractedTimestamp || new Date(session.recordingStartTime),
              s3Key: newKey,
              s3Url: `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${newKey}`,
              status: "completed",
              userId: dbUserId,
            },
          });

          await prisma.conversation.create({
            data: {
              meetingId: meeting.id,
              userId: dbUserId,
              recordingId: recording.id,
              participantDialects: dialects,
              duration: 0.0,
              quality: 0.0,
              earnings: 0.0,
              status: "incomplete",
              notes: `Conversation recording ${session.recordingNumber}`,
              startTime: session.recordingStartTime,
              endTime: session.recordingEndTime || new Date(),
            },
          });
        }

        await prisma.recordingSession.update({
          where: { id: session.id },
          data: {
            status: "completed",
            isRecording: false,
            recordingEndTime: new Date(),
          },
        });

        await transcriptQueue.add(
          "process-transcripts",
          {
            meetingName: meetingName,
            recordingNumber: session.recordingNumber,
            folder_name: folder_name,
            sessionId: session.id,
          },
          {
            jobId: `transcript-${meetingName}-${session.recordingNumber}`,
            priority: 1,
          }
        );

        console.log(
          `🎯 Queued transcript processing for session ${session.recordingNumber}`
        );

        processedCount++;
      }
    }

    await recordingQueue.client.del(`webhook:root:${meetingName}`);
    await recordingQueue.client.del(zoomFilesKey);

    return {
      success: true,
      sessionsProcessed: processedCount,
      sessionsDeleted: deletedCount,
      totalFiles: expectedTotalFiles,
      directoriesProcessed: directories.length,
    };
  } finally {
    await recordingQueue.client.del(lockKey);
  }
});

// recordingQueue.process("process-meeting", async (job: any) => {
//   const { meetingName, bucket, directories } = job.data;

//   console.log(`📥 Processing meeting: ${meetingName}`);
//   console.log(`   Attempt: ${job.attemptsMade + 1}`);
//   console.log(`   Directories: ${directories.length}`);
//   directories.forEach((dir: string, i: number) => {
//     console.log(`      ${i + 1}. ${dir}`);
//   });

//   const meeting = await prisma.meeting.findUnique({
//     where: { sessionName: meetingName },
//     include: {
//       participants: true,
//     },
//   });

//   const dialects = meeting.participants.map((p) => p.dialect || "Unknown");

//   const zoomFilesKey = `webhook:zoom:files:${meetingName}`;
//   const zoomFilesData = await recordingQueue.client.get(zoomFilesKey);

//   let fileMappings: ZoomFileMapping[] = [];

//   if (zoomFilesData) {
//     const parsed: WebhookZoomFiles = JSON.parse(zoomFilesData);
//     fileMappings = parsed.fileMappings;
//   } else {
//     console.warn(`⚠️ No file mappings found for meeting ${meetingName}`);
//   }

//   const pendingSessions = await prisma.recordingSession.findMany({
//     where: {
//       meetingName,
//       status: {
//         in: ["incomplete", "interrupted"],
//       },
//     },
//     orderBy: { recordingNumber: "asc" },
//   });

//   if (pendingSessions.length === 0) {
//     console.log("✅ No pending sessions found - all already processed");

//     await recordingQueue.client.del(`webhook:directories:${meetingName}`);

//     return {
//       success: true,
//       message: "All sessions already processed",
//       sessionsProcessed: 0,
//       sessionsDeleted: 0,
//     };
//   }

//   console.log(`💾 Found ${pendingSessions.length} pending sessions`);
//   pendingSessions.forEach((session) => {
//     console.log(`   - Session ${session.recordingNumber}: ${session.status}`);
//   });

//   const participantCount = pendingSessions[0]?.participantCount || 2;

//   const expectedTotalFiles = pendingSessions.length * participantCount;

//   const incompleteCount = pendingSessions.filter(
//     (s) => s.status === "incomplete"
//   ).length;
//   const interruptedCount = pendingSessions.filter(
//     (s) => s.status === "interrupted"
//   ).length;

//   console.log(`📊 Expected: ${expectedTotalFiles} files total`);
//   console.log(
//     `   - ${incompleteCount} incomplete sessions × ${participantCount} = ${
//       incompleteCount * participantCount
//     } files to save`
//   );
//   console.log(
//     `   - ${interruptedCount} interrupted sessions × ${participantCount} = ${
//       interruptedCount * participantCount
//     } files to delete`
//   );

//   const allFiles = await getAllFilesFromMultipleDirectories(
//     bucket,
//     directories
//   );

//   console.log(`📦 Files in S3: ${allFiles.length}/${expectedTotalFiles}`);

//   if (allFiles.length < expectedTotalFiles) {
//     const missing = expectedTotalFiles - allFiles.length;
//     console.log(`⏳ Waiting for ${missing} more file(s)...`);
//     throw new Error(
//       `Incomplete: ${allFiles.length}/${expectedTotalFiles} files ready`
//     );
//   }

//   console.log(`✅ All ${expectedTotalFiles} files are ready!`);

//   const fileGroups = groupFilesInOrder(allFiles, participantCount);

//   let processedCount = 0;
//   let deletedCount = 0;

//   for (let i = 0; i < pendingSessions.length; i++) {
//     const session = pendingSessions[i];
//     const files = fileGroups[i] || [];

//     console.log(
//       `📦 Processing session ${session.recordingNumber} (${session.status})`
//     );

//     if (session.status === "interrupted") {
//       console.log(
//         `🗑️ Deleting interrupted recording ${session.recordingNumber}`
//       );

//       if (files.length > 0) {
//         for (const s3Key of files) {
//           try {
//             await s3Client.send(
//               new HeadObjectCommand({ Bucket: bucket, Key: s3Key })
//             );

//             await s3Client.send(
//               new DeleteObjectCommand({ Bucket: bucket, Key: s3Key })
//             );

//             console.log(`✅ Deleted: ${s3Key.split("/").pop()}`);
//           } catch (error: any) {
//             if (error.name === "NoSuchKey" || error.Code === "NoSuchKey") {
//               console.log(`⏭️ Already deleted: ${s3Key.split("/").pop()}`);
//             } else {
//               throw error;
//             }
//           }
//         }
//       }

//       await prisma.recordingSession.update({
//         where: { id: session.id },
//         data: { status: "deleted" },
//       });

//       console.log(`✅ Session ${session.recordingNumber} marked as deleted`);
//       deletedCount++;
//       continue;
//     }

//     if (session.status === "incomplete") {
//       if (files.length === 0) {
//         console.warn(
//           `⚠️ No files for session ${session.recordingNumber} - skipping`
//         );
//         continue;
//       }

//       console.log(`📦 Organizing session ${session.recordingNumber}`);
//       console.log(`   Files: ${files.length}`);

//       const meetings_date = meeting.createdAt
//         .toLocaleString("en-CA", {
//           timeZone: "America/Los_Angeles",
//           year: "numeric",
//           month: "2-digit",
//           day: "2-digit",
//         })
//         .replace(/,/g, "")
//         .replace(/\s+/g, "-")
//         .toLowerCase();

//       const timestamp = meeting.createdAt.getTime();

//       const folder_name = `${meetings_date}/${meeting.createdAt
//         .toLocaleString("en-CA", {
//           timeZone: "America/Los_Angeles",
//           year: "numeric",
//           month: "2-digit",
//           day: "2-digit",
//           hour: "2-digit",
//           minute: "2-digit",
//           hour12: true,
//         })
//         .replace(/,/g, "")
//         .replace(/\s+/g, "-")
//         .toLowerCase()}-${timestamp}`;

//       for (const s3Key of files) {
//         const participantMatch = s3Key.match(/separate(\d+)/);
//         const participantNumber = participantMatch ? participantMatch[1] : "1";

//         const timestampMatch = s3Key.match(/GMT(\d{8}-\d{6})/);
//         const timestamp = timestampMatch ? timestampMatch[1] : "";

//         const matchedMapping = fileMappings.find(
//           (mapping) =>
//             mapping.timestamp === timestamp &&
//             mapping.separateNumber === participantNumber
//         );

//         let username: string | null = null;

//         if (matchedMapping) {
//           username = matchedMapping.username;
//           console.log(
//             `✅ Matched file: separate${participantNumber} → User ${username}`
//           );
//         } else {
//           console.warn(
//             `⚠️ Could not match file separate${participantNumber} (timestamp: ${timestamp}) to Zoom user`
//           );
//         }

//         const newKey = `${meeting.language}/${folder_name}/recording-${session.recordingNumber}/participant-${participantNumber}.m4a`;

//         console.log(
//           `   ${s3Key.split("/").pop()} → recording-${
//             session.recordingNumber
//           }/participant-${participantNumber}.m4a`
//         );

//         await s3Client.send(
//           new CopyObjectCommand({
//             Bucket: bucket,
//             CopySource: encodeURIComponent(`${bucket}/${s3Key}`),
//             Key: newKey,
//           })
//         );

//         await s3Client.send(
//           new DeleteObjectCommand({ Bucket: bucket, Key: s3Key })
//         );

//         let dbUserId: number | null = null;

//         if (username) {
//           dbUserId = await mapZoomUserToDbUser(username);
//         }

//         const extractedTimestamp = extractTimestampFromS3Key(s3Key);

//         const recording = await prisma.recording.create({
//           data: {
//             meetingName,
//             recordingNumber: session.recordingNumber,
//             participantNumber: parseInt(participantNumber),
//             recordingStartTime:
//               extractedTimestamp || new Date(session.recordingStartTime),
//             s3Key: newKey,
//             s3Url: `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${newKey}`,
//             status: "completed",
//             userId: dbUserId,
//           },
//         });

//         const conversation = await prisma.conversation.create({
//           data: {
//             meetingId: meeting.id,
//             userId: dbUserId,
//             recordingId: recording.id,
//             participantDialects: dialects,
//             duration: 0.0,
//             quality: 0.0,
//             earnings: 0.0,
//             status: "incomplete",
//             notes: `Conversation recording ${session.recordingNumber}`,
//             startTime: session.recordingStartTime,
//             endTime: session.recordingEndTime || new Date(),
//           },
//         });

//         console.log(`✅ Saved to database`);
//       }

//       await prisma.recordingSession.update({
//         where: { id: session.id },
//         data: { status: "completed" },
//       });

//       console.log(`✅ Session ${session.recordingNumber} completed`);

//       // await transcriptQueue.add(
//       //   "process-transcripts",
//       //   {
//       //     meetingName: meetingName,
//       //     recordingNumber: session.recordingNumber,
//       //     folder_name: folder_name,
//       //     sessionId: session.id,
//       //   },
//       //   {
//       //     jobId: `transcript-${meetingName}-${session.recordingNumber}`,
//       //     priority: 1,
//       //   }
//       // );

//       // console.log(
//       //   `🎯 Queued transcript processing for session ${session.recordingNumber}`
//       // );

//       processedCount++;
//     }
//   }

//   await recordingQueue.client.del(`webhook:directories:${meetingName}`);
//   await recordingQueue.client.del(zoomFilesKey);
//   console.log(`🗑️ Cleaned up webhook data`);

//   await prisma.$disconnect();

//   return {
//     success: true,
//     sessionsProcessed: processedCount,
//     sessionsDeleted: deletedCount,
//     totalFiles: allFiles.length,
//     directoriesProcessed: directories.length,
//   };
// });

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

const API_BASE_URL = "http://0.0.0.0:8000";
const HOURLY_RATE = 7.5;
const SECONDS_PER_HOUR = 3600;
const NGROK_HEADERS = { "ngrok-skip-browser-warning": "true" };

const callAPI = async (endpoint: string, data: any) => {
  try {
    const response = await axios.post(`${API_BASE_URL}${endpoint}`, data, {
      headers: NGROK_HEADERS,
    });
    return response.data;
  } catch (error) {
    throw new Error(`API call failed [${endpoint}]: ${error.message}`);
  }
};

const calculateEarnings = (durationSeconds: number): number => {
  return (durationSeconds / SECONDS_PER_HOUR) * HOURLY_RATE;
};

const processConversation = async (
  recording: any,
  meetingName: string,
  language: string,
  recordingNumber: number,
  // speakerQuality: number,
  // flagging: boolean,
  // flaggin_reasons: string[],
  folder_name: string
) => {
  const conversation = await prisma.conversation.findFirst({
    where: { recordingId: recording.id },
    include: { user: true },
  });

  if (!conversation) {
    console.warn(`⚠️  No conversation found for recording ${recording.id}`);
    return;
  }

  const currentMeeting = await prisma.meeting.findUnique({
    where: { id: conversation.meetingId },
    include: {
      participants: {
        select: { userId: true },
      },
    },
  });

  const userIds = currentMeeting.participants.map((p) => p.userId);
  const userId1 = userIds[0];
  const userId2 = userIds[1];

  const previousMeetings = await prisma.meeting.findMany({
    where: {
      id: { not: currentMeeting.id },
      participants: {
        every: {
          userId: { in: [userId1, userId2] },
        },
      },
      conversations: {
        some: {
          status: "completed",
          flagged_status: false,
        },
      },
    },
    include: {
      _count: {
        select: {
          conversations: {
            where: {
              status: "completed",
              flagged_status: false,
            },
          },
        },
      },
      participants: {
        where: {
          userId: { in: [userId1, userId2] },
        },
      },
    },
  });

  const validMeetings = previousMeetings.filter(
    (meeting) =>
      meeting.participants.length === 2 && meeting._count.conversations > 0
  );

  const count = validMeetings.length;

  const metadataResponse = await callAPI("/save-metadata", {
    s3_folder_path: `${language}/${folder_name}/recording-${recordingNumber}`,
    gender: conversation.user.gender,
    speaker_number: recording.participantNumber,
    age: calculateAge(conversation.user.date_of_birth),
    dialect: conversation.user.language_dialect,
    userId: conversation.userId,
  });

  const totalDuration = metadataResponse?.metadata?.total_duration || 0;

  console.log(`✅ Got duration from metadata API: ${totalDuration}s`);

  if (totalDuration <= 120) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        // quality: Math.random() * (0.85 - 0.8) + 0.8,
        quality: 0.0,
        duration: totalDuration,
        earnings: calculateEarnings(totalDuration),
        flagged_status: true,
        // flagged_reasons: flaggin_reasons,
        status: "incomplete",
      },
    });
  } else {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        // quality: Math.random() * (0.85 - 0.8) + 0.8,
        quality: 0.0,
        duration: totalDuration,
        earnings: calculateEarnings(totalDuration),
        flagged_status: false,
        // flagged_reasons: flaggin_reasons,
        status: "completed",
      },
    });
  }

  console.log(
    `✅ Updated conversation for participant ${recording.participantNumber}`
  );
};

transcriptQueue.process("process-transcripts", async (job: any) => {
  const { meetingName, recordingNumber, folder_name, sessionId } = job.data;

  console.log(`📥 Processing transcripts: ${meetingName}`);
  console.log(`📥 Recording Number: recording-${recordingNumber}`);
  console.log(`   Attempt: ${job.attemptsMade + 1}`);

  const meeting = await prisma.meeting.findUnique({
    where: { sessionName: meetingName },
  });

  if (!meeting) {
    throw new Error(`Meeting not found: ${meetingName}`);
  }

  const s3FolderPath = `${meeting.language}/${folder_name}/recording-${recordingNumber}`;

  // console.log("🎙️  Step 1: Transcribing audio...");
  // await callAPI("/transcribe", {
  //   language: meeting.language,
  //   s3_folder_path: s3FolderPath,
  // });
  // console.log("✅ Transcription complete");

  // console.log("📊 Step 2: Analyzing quality...");
  // const qualityData = await callAPI("/analyze-quality", {
  //   language: meeting.language,
  //   s3_transcript_path: `${s3FolderPath}/transcription.txt`,
  // });
  // console.log("✅ Quality analysis complete");

  // console.log("Step 3: Flagging the conversation...");
  // const flagging_response = await callAPI("/flag-filter", {
  //   s3_transcript_path: `${s3FolderPath}/transcription.txt`,
  //   s3_quality_scores_path: `${s3FolderPath}/quality_scores.json`,
  //   language: meeting.language,
  //   check_similarity: false,
  // });
  // console.log("✅ flagging of coversation completed");

  console.log("👥 Step 4: Processing conversations...");
  const recordings = await prisma.recording.findMany({
    where: {
      meetingName: meetingName,
      recordingNumber: recordingNumber,
    },
  });

  await Promise.all(
    recordings.map((recording) => {
      const speakerKey = `speaker_${recording.participantNumber}`;
      // const speakerQuality = qualityData.speakers[speakerKey]?.final_score;
      // const totalDuration = qualityData.conversation_duration;

      // if (!speakerQuality) {
      //   console.warn(`⚠️  No quality score for ${speakerKey}`);
      //   return Promise.resolve();
      // }

      return processConversation(
        recording,
        meetingName,
        meeting.language,
        recordingNumber,
        // speakerQuality,
        // flagging_response.should_flag,
        // flagging_response.reasons,
        folder_name
      );
    })
  );

  console.log("🎙️  Step 5: Merging audio to conversation.wav...");
  await callAPI("/merge-audio", {
    s3_folder_path: s3FolderPath,
  });
  console.log("✅ Audio merging completed");

  console.log("✅ All conversations processed successfully");

  return {
    success: true,
    message: "All processes completed successfully",
    processedRecordings: recordings.length,
  };
});

transcriptQueue.on("completed", (job: any, result: any) => {
  console.log(`✅ Transcript job ${job.id} completed:`, result);
});

transcriptQueue.on("failed", (job: any, err: any) => {
  console.error(
    `❌ Transcript job ${job.id} failed after ${job.attemptsMade} attempts:`,
    err.message
  );

  if (job.attemptsMade >= 5) {
    console.error(`🚨 CRITICAL: Job ${job.id} permanently failed`);
  }
});

transcriptQueue.on("progress", (job: any, progress: number) => {
  console.log(`⏳ Transcript job ${job.id} progress: ${progress}%`);
});

transcriptQueue.on("stalled", (job: any) => {
  console.warn(`⚠️ Job ${job.id} stalled`);
});
