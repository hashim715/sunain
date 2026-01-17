import { prisma } from "../config/postgres";
import TOPICS from "./topics.json";

export async function fillTopicData() {
  for (const [topicIndex, topic] of TOPICS.entries()) {
    const createdTopic = await prisma.topic.create({
      data: {
        title: topic.title,
        order: topicIndex,
      },
    });

    for (const [subtopicIndex, subtopic] of topic.subtopics.entries()) {
      const createdSubtopic = await prisma.subtopic.create({
        data: {
          title: subtopic.title,
          overview: subtopic.description.overview,
          order: subtopicIndex,
          topicId: createdTopic.id,
        },
      });

      await prisma.vocabulary.createMany({
        data: subtopic.description.vocabulary.map((term, index) => ({
          term,
          order: index,
          subtopicId: createdSubtopic.id,
        })),
      });

      await prisma.conversationStarter.createMany({
        data: subtopic.description.starters.map((text, index) => ({
          text,
          order: index,
          subtopicId: createdSubtopic.id,
        })),
      });

      await prisma.example.createMany({
        data: subtopic.description.examples.map((text, index) => ({
          text,
          order: index,
          subtopicId: createdSubtopic.id,
        })),
      });
    }
  }
}
