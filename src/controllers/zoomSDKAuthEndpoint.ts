import { toStringArray } from "../utils/zoomSdkAuthEndpointUtils";
import {
  inNumberArray,
  isBetween,
  isLengthLessThan,
  isRequired,
  matchesStringArray,
  validateRequest,
} from "../utils/zoomSDKAuthEndpointValidations";
import dotenv from "dotenv";
import { KJUR } from "jsrsasign";
import { Request, Response, NextFunction, RequestHandler } from "express";
import { logger } from "../utils/logger";
import { internalServerError, badRequestResponse } from "./errors";
import { prisma } from "../config/postgres";
import {
  S3Client,
  ListObjectsV2Command,
  CopyObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

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
      return res.status(400).json({ errors: validationErrors });
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
    };

    const sHeader = JSON.stringify(oHeader);
    const sPayload = JSON.stringify(oPayload);

    const secretKey = process.env.ZOOM_VIDEO_SDK_SECRET as string;
    const sdkJWT = KJUR.jws.JWS.sign("HS256", sHeader, sPayload, secretKey);

    return res.json({ signature: sdkJWT });
  } catch (err) {
    logger.error(`Error generating Zoom signature: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
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

export const handleZoomWebhook: RequestHandler = async (
  req: Request,
  res: Response
) => {
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

    if (!meetingName) {
      return res.status(400).json({ error: "Session name not found" });
    }

    if (!participantAudioFiles || participantAudioFiles.length === 0) {
      return res.status(200).json({ message: "No files to process" });
    }

    const session = await prisma.recordingSession.findUnique({
      where: { meetingName },
    });

    if (session?.status === "interrupted") {
      await new Promise((resolve) => setTimeout(resolve, 15000));
      await deleteInterruptedRecording(meetingName);

      await prisma.recordingSession.update({
        where: { meetingName },
        data: { status: "deleted" },
      });

      return res.status(200).json({
        success: true,
        message: "Interrupted recording deleted",
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 10000));

    const groupedByRecording = new Map<string, any[]>();

    for (const file of participantAudioFiles) {
      const recordingStart = file.recording_start;

      if (!groupedByRecording.has(recordingStart)) {
        groupedByRecording.set(recordingStart, []);
      }
      groupedByRecording.get(recordingStart)!.push(file);
    }

    const sortedRecordings = Array.from(groupedByRecording.entries()).sort(
      (a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime()
    );

    let recordingNumber = await getNextRecordingNumber(meetingName);

    for (const [recordingStart, files] of sortedRecordings) {
      for (const fileInfo of files) {
        const externalUrl = fileInfo.external_storage_url;
        const s3Key = externalUrl.replace(`s3://${BUCKET_NAME}/`, "");

        const participantMatch = s3Key.match(/separate(\d+)/);
        const participantNumber = participantMatch ? participantMatch[1] : "1";

        const newKey = `${meetingName}/recording-${recordingNumber}/participant-${participantNumber}.m4a`;

        const copyCommand = new CopyObjectCommand({
          Bucket: BUCKET_NAME,
          CopySource: encodeURIComponent(`${BUCKET_NAME}/${s3Key}`),
          Key: newKey,
        });

        await s3Client.send(copyCommand);

        const deleteCommand = new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: s3Key,
        });

        await s3Client.send(deleteCommand);

        await prisma.recording.create({
          data: {
            meetingName,
            recordingNumber,
            participantNumber: parseInt(participantNumber),
            s3Key: newKey,
            s3Url: `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${newKey}`,
            createdAt: new Date(),
          },
        });
      }

      recordingNumber++;
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
};

const deleteInterruptedRecording = async (meetingName: string) => {
  try {
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: "cmr/",
    });

    const response = await s3Client.send(listCommand);

    if (!response.Contents || response.Contents.length === 0) {
      return;
    }

    const recentFiles = response.Contents.filter((file) => {
      const fileAge = Date.now() - (file.LastModified?.getTime() || 0);
      return fileAge < 40 * 1000;
    });

    for (const file of recentFiles) {
      if (!file.Key) continue;

      const deleteCommand = new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: file.Key,
      });

      await s3Client.send(deleteCommand);
    }
  } catch (error) {
    console.error("Error deleting interrupted recording:", error);
    throw error;
  }
};

const getNextRecordingNumber = async (meetingName: string): Promise<number> => {
  const latestRecording = await prisma.recording.findFirst({
    where: { meetingName },
    orderBy: { recordingNumber: "desc" },
  });

  return latestRecording ? latestRecording.recordingNumber + 1 : 1;
};
