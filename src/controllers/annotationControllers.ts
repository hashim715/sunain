import { prisma } from "../config/postgres";
import { Request, Response, RequestHandler } from "express";
import { internalServerError } from "./errors";
import dotenv from "dotenv";
import { logger } from "../utils/logger";
import bcrypt from "bcrypt";
import { sendTokenCookie } from "../utils/sendTokenCookie";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "../config/aws_s3";
import jwt_decode from "jwt-decode";

dotenv.config();

const BUCKET_NAME = process.env.S3_BUCKET_NAME;

export const login: RequestHandler = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Please provide valid inputs" });
    }

    let user = await prisma.user.findFirst({
      where: { username: username },
    });

    if (!user || !user.is_annotator) {
      return res.status(400).json({
        success: false,
        message: "User is not authorized",
      });
    }

    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid password",
      });
    }

    await sendTokenCookie(res, user.username);

    return res.status(200).json({
      success: true,
      message: "Logged in successfully",
    });
  } catch (err) {
    logger.error(`Error in login: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const getFirstRecordingForUser: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { language } = req.params;
    const token = req.cookies.authToken;

    if (!token) {
      return res
        .status(404)
        .json({ success: false, message: "User does not exist" });
    }

    const { username }: { username: string } = jwt_decode(token);
    const user = await prisma.user.findFirst({ where: { username } });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User does not exist" });
    }

    if (
      !user?.annotation_recordings ||
      user.annotation_recordings.length === 0
    ) {
      return res.status(404).json({
        error: "No recordings assigned to this user",
      });
    }

    for (const recordingPath of user.annotation_recordings) {
      const filesCommand = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: recordingPath,
      });

      const filesResponse = await s3.send(filesCommand);
      const hasAnnotation = filesResponse.Contents?.some((file) =>
        file.Key?.endsWith("human_transcript.txt")
      );

      if (!hasAnnotation) {
        const pathParts = recordingPath.split("/").filter((p) => p);

        return res.status(200).json({
          dateFolder: pathParts[1],
          timeFolder: pathParts[2],
          recording: pathParts[3],
          hasRecording: true,
        });
      }
    }

    return res.status(200).json({
      hasRecording: false,
      message:
        "No unannotated recordings available in your assigned recordings",
    });
  } catch (err) {
    logger.error(`Error getting first recording: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const getNextAvailableRecording: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const {
      language,
      currentDateFolder,
      currentTimeFolder,
      currentRecordingId,
    } = req.params;
    const token = req.cookies.authToken;

    if (!token) {
      return res
        .status(404)
        .json({ success: false, message: "User does not exist" });
    }

    const { username }: { username: string } = jwt_decode(token);
    const user = await prisma.user.findFirst({ where: { username } });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User does not exist" });
    }

    if (
      !user?.annotation_recordings ||
      user.annotation_recordings.length === 0
    ) {
      return res.status(404).json({ error: "No recordings assigned" });
    }

    const isFirstRequest = !currentDateFolder || currentDateFolder === "none";
    const decodedCurrentDate = !isFirstRequest
      ? decodeURIComponent(currentDateFolder)
      : null;
    const decodedCurrentTime = !isFirstRequest
      ? decodeURIComponent(currentTimeFolder)
      : null;
    const decodedCurrentRecording = !isFirstRequest
      ? decodeURIComponent(currentRecordingId)
      : null;

    let foundCurrent = isFirstRequest;

    for (const recordingPath of user.annotation_recordings) {
      const pathParts = recordingPath.split("/").filter((p) => p);
      const dateFolder = pathParts[1];
      const timeFolder = pathParts[2];
      const recording = pathParts[3];

      if (!foundCurrent) {
        if (
          dateFolder === decodedCurrentDate &&
          timeFolder === decodedCurrentTime &&
          recording === decodedCurrentRecording
        ) {
          foundCurrent = true;
        }
        continue;
      }

      const filesCommand = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: recordingPath,
      });

      const filesResponse = await s3.send(filesCommand);
      const hasAnnotation = filesResponse.Contents?.some((file) =>
        file.Key?.endsWith("human_transcript.txt")
      );

      if (!hasAnnotation) {
        return res.status(200).json({
          dateFolder,
          timeFolder,
          recording,
          hasNext: true,
        });
      }
    }

    return res.status(200).json({
      hasNext: false,
      message: "No more recordings available in your assigned recordings",
    });
  } catch (err) {
    logger.error(`Error getting next recording: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const getPreviousAvailableRecording: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const {
      language,
      currentDateFolder,
      currentTimeFolder,
      currentRecordingId,
    } = req.params;
    const token = req.cookies.authToken;

    if (!token) {
      return res
        .status(404)
        .json({ success: false, message: "User does not exist" });
    }

    const { username }: { username: string } = jwt_decode(token);
    const user = await prisma.user.findFirst({ where: { username } });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User does not exist" });
    }

    if (!user?.annotation_recordings) {
      return res.status(404).json({ error: "No recordings assigned" });
    }

    const decodedCurrentDate = decodeURIComponent(currentDateFolder);
    const decodedCurrentTime = decodeURIComponent(currentTimeFolder);
    const decodedCurrentRecording = decodeURIComponent(currentRecordingId);

    const allUnannotatedRecordings: Array<{
      dateFolder: string;
      timeFolder: string;
      recording: string;
    }> = [];

    for (const recordingPath of user.annotation_recordings) {
      const pathParts = recordingPath.split("/").filter((p) => p);
      const dateFolder = pathParts[1];
      const timeFolder = pathParts[2];
      const recording = pathParts[3];

      const filesCommand = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: recordingPath,
      });

      const filesResponse = await s3.send(filesCommand);
      const hasAnnotation = filesResponse.Contents?.some((file) =>
        file.Key?.endsWith("human_transcript.txt")
      );

      if (!hasAnnotation) {
        allUnannotatedRecordings.push({
          dateFolder,
          timeFolder,
          recording,
        });
      }
    }

    const currentIndex = allUnannotatedRecordings.findIndex(
      (rec) =>
        rec.dateFolder === decodedCurrentDate &&
        rec.timeFolder === decodedCurrentTime &&
        rec.recording === decodedCurrentRecording
    );

    if (currentIndex > 0) {
      const previousRecording = allUnannotatedRecordings[currentIndex - 1];
      return res.status(200).json({
        dateFolder: previousRecording.dateFolder,
        timeFolder: previousRecording.timeFolder,
        recording: previousRecording.recording,
        hasPrevious: true,
      });
    }

    return res.status(200).json({
      hasPrevious: false,
      message: "This is the first recording",
    });
  } catch (err) {
    logger.error(`Error getting previous recording: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const listLanguages: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Delimiter: "/",
    });

    const response = await s3.send(command);
    const languages = (
      response.CommonPrefixes?.map((prefix) => ({
        name: prefix.Prefix.replace("/", ""),
        path: prefix.Prefix,
      })) || []
    ).filter((lang) => lang.name === "Arabic");

    return res.status(200).json({ languages });
  } catch (err) {
    logger.error(`Error in listing languages: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const listDateFolders: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { language } = req.params;
    const prefix = `${language}/`;

    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
      Delimiter: "/",
    });

    const response = await s3.send(command);
    const allDates =
      response.CommonPrefixes?.map((prefix) => ({
        name: prefix.Prefix.replace(`${language}/`, "").replace("/", ""),
        path: prefix.Prefix,
      })) || [];

    allDates.sort((a, b) => b.name.localeCompare(a.name));

    const last10Dates = allDates.slice(0, 10);

    const datesWithUnannotatedRecordings = [];

    for (const date of last10Dates) {
      // List all time folders in this date
      const timeCommand = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: date.path,
        Delimiter: "/",
      });

      const timeResponse = await s3.send(timeCommand);
      const timeFolders = timeResponse.CommonPrefixes || [];

      let hasUnannotated = false;

      for (const timePrefix of timeFolders) {
        if (hasUnannotated) break;

        const recordingCommand = new ListObjectsV2Command({
          Bucket: BUCKET_NAME,
          Prefix: timePrefix.Prefix,
          Delimiter: "/",
        });

        const recordingResponse = await s3.send(recordingCommand);
        const recordingFolders = recordingResponse.CommonPrefixes || [];

        for (const recordingPrefix of recordingFolders) {
          const filesCommand = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: recordingPrefix.Prefix,
          });

          const filesResponse = await s3.send(filesCommand);
          const hasAnnotation = filesResponse.Contents?.some((file) =>
            file.Key.endsWith("human_transcript.txt")
          );

          if (!hasAnnotation) {
            hasUnannotated = true;
            break;
          }
        }
      }

      if (hasUnannotated) {
        datesWithUnannotatedRecordings.push(date);
      }
    }

    return res.status(200).json({ dates: datesWithUnannotatedRecordings });
  } catch (err) {
    logger.error(`Error in listing date folders: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const listTimeFolders: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { language, dateFolder } = req.params;
    const prefix = `${language}/${dateFolder}/`;

    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
      Delimiter: "/",
    });

    const response = await s3.send(command);
    const allTimes =
      response.CommonPrefixes?.map((prefix) => ({
        name: prefix.Prefix.replace(`${language}/${dateFolder}/`, "").replace(
          "/",
          ""
        ),
        path: prefix.Prefix,
      })) || [];

    const timesWithUnannotatedRecordings = [];

    for (const time of allTimes) {
      const recordingCommand = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: time.path,
        Delimiter: "/",
      });

      const recordingResponse = await s3.send(recordingCommand);
      const recordingFolders = recordingResponse.CommonPrefixes || [];

      let hasUnannotated = false;

      for (const recordingPrefix of recordingFolders) {
        const filesCommand = new ListObjectsV2Command({
          Bucket: BUCKET_NAME,
          Prefix: recordingPrefix.Prefix,
        });

        const filesResponse = await s3.send(filesCommand);
        const hasAnnotation = filesResponse.Contents?.some((file) =>
          file.Key.endsWith("human_transcript.txt")
        );

        if (!hasAnnotation) {
          hasUnannotated = true;
          break;
        }
      }

      if (hasUnannotated) {
        timesWithUnannotatedRecordings.push(time);
      }
    }

    return res.status(200).json({ times: timesWithUnannotatedRecordings });
  } catch (err) {
    logger.error(`Error in listing time folders: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const languageTimeFolderRecordingsAndNextUnannotated: RequestHandler =
  async (req: Request, res: Response) => {
    try {
      const { language, dateFolder, timeFolder } = req.params;
      const decodedTime = decodeURIComponent(timeFolder);
      const prefix = `${language}/${dateFolder}/${decodedTime}/`;

      const command = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix,
        Delimiter: "/",
      });

      const response = await s3.send(command);
      const recordings =
        response.CommonPrefixes?.map((prefix) => ({
          name: prefix.Prefix.replace(
            `${language}/${dateFolder}/${decodedTime}/`,
            ""
          ).replace("/", ""),
          path: prefix.Prefix,
        })) || [];

      const unannotatedRecordings = [];

      for (const recording of recordings) {
        const checkCommand = new ListObjectsV2Command({
          Bucket: BUCKET_NAME,
          Prefix: recording.path,
        });

        const recordingFiles = await s3.send(checkCommand);
        const hasAnnotation = recordingFiles.Contents?.some((file) =>
          file.Key.endsWith("human_transcript.txt")
        );

        if (!hasAnnotation) {
          unannotatedRecordings.push(recording);
        }
      }

      if (unannotatedRecordings.length === 0) {
        return res.json({
          message: "No recordings available for annotation",
          recordings: [],
        });
      }

      return res.status(200).json({ recordings: unannotatedRecordings });
    } catch (err) {
      logger.error(`Error in listing recordings: ${err}`);
      if (!res.headersSent) {
        return internalServerError(res);
      }
    } finally {
      await prisma.$disconnect();
    }
  };

export const getRecordingFilesPlusAnnotated: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { language, dateFolder, timeFolder, recordingId } = req.params;
    const decodedTime = decodeURIComponent(timeFolder);
    const decodedRecordingId = decodeURIComponent(recordingId);
    const prefix = `${language}/${dateFolder}/${decodedTime}/${decodedRecordingId}/`;

    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
    });

    const response = await s3.send(command);
    const files = response.Contents || [];

    const audioFile = files.find((f) => f.Key.endsWith("conversation.mp3"));
    const transcriptFile = files.find((f) =>
      f.Key.endsWith("transcription.txt")
    );

    if (!audioFile || !transcriptFile) {
      return res.status(404).json({ error: "Required files not found" });
    }

    const audioUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: audioFile.Key,
        ResponseContentDisposition: "inline",
        ResponseCacheControl: "no-cache",
      }),
      {
        expiresIn: 3600,
      }
    );

    const transcriptUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: transcriptFile.Key }),
      { expiresIn: 3600 }
    );

    return res.status(200).json({
      audioUrl,
      transcriptUrl,
      audioKey: audioFile.Key,
      transcriptKey: transcriptFile.Key,
      recordingPath: prefix,
    });
  } catch (err) {
    logger.error(`Error in getting recording files: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const uploadAnnotationFile: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { recordingPath, content } = req.body;

    if (!recordingPath || !content) {
      return res
        .status(400)
        .json({ error: "Missing recordingPath or content" });
    }

    const key = `${recordingPath}human_transcript.txt`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: content,
      ContentType: "text/plain",
    });

    await s3.send(command);

    return res
      .status(200)
      .json({ success: true, message: "Annotation uploaded successfully" });
  } catch (err) {
    logger.error(`Error in uploading annotation file: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};
