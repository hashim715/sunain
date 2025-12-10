import { Request, Response, RequestHandler } from "express";
import { prisma } from "../config/postgres";
import { internalServerError } from "./errors";
import { logger } from "../utils/logger";

export const getAllData: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 14;
    const skip = (page - 1) * limit;

    const [topics, totalCount] = await Promise.all([
      prisma.topic.findMany({
        skip,
        take: limit,
        orderBy: {
          order: "asc",
        },
        include: {
          subtopics: {
            orderBy: {
              order: "asc",
            },
            include: {
              vocabulary: {
                orderBy: {
                  order: "asc",
                },
              },
              starters: {
                orderBy: {
                  order: "asc",
                },
              },
              examples: {
                orderBy: {
                  order: "asc",
                },
              },
            },
          },
        },
      }),
      prisma.topic.count(),
    ]);

    const formattedData = topics.map((topic) => ({
      id: topic.id,
      title: topic.title,
      subtopics: topic.subtopics.map((subtopic) => ({
        id: subtopic.id,
        title: subtopic.title,
        description: {
          overview: subtopic.overview,
          vocabulary: subtopic.vocabulary.map((v) => v.term),
          starters: subtopic.starters.map((s) => s.text),
          examples: subtopic.examples.map((e) => e.text),
        },
      })),
    }));

    return res.status(200).json({
      success: true,
      data: formattedData,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    logger.error(`Error in getting data: ${error}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};
