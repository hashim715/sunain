import { prisma } from "../config/postgres";

const TOPICS = [
  {
    title: "Get to Know Each Other",
    subtopics: [
      {
        title: "Introductions & Everyday Life",
        description: {
          overview:
            "A relaxed, open-ended space to share a little about yourself—who you are, what your days look like, and the small things that make up your life.",
          vocabulary: [
            "Hobbies",
            "Routine",
            "Interests",
            "Work or Studies",
            "Free Time",
            "Background",
            "Daily Habits",
          ],
          starters: [
            "How would you describe yourself to someone you just met?",
            "What does a typical day look like for you?",
            "What do you enjoy doing in your free time?",
            "Is there something small that makes your day better?",
            "What have you been spending most of your time on lately?",
          ],
          examples: [
            "Talking about a favorite hobby or pastime",
            "Sharing what you do for work or study",
            "Describing a normal weekday or weekend",
            "Mentioning something you’re currently interested in or learning",
          ],
        },
      },
    ],
  },
  {
    title: "Recent Events",
    subtopics: [
      {
        title: "Something That Happened Recently",
        description: {
          overview:
            "An open-ended prompt to share a recent moment that stood out—whether it was funny, exciting, surprising, or meaningful—and how it made you feel.",
          vocabulary: [
            "Story",
            "Emotion",
            "Reaction",
            "Surprise",
            "Excitement",
            "Laughter",
            "Moment",
          ],
          starters: [
            "What’s something that happened recently that stuck with you?",
            "Did anything funny or unexpected happen to you lately?",
            "What’s a recent moment that made you feel excited or happy?",
            "How did you react when it happened?",
            "Is there a small recent win you’d like to share?",
          ],
          examples: [
            "A funny misunderstanding or awkward moment",
            "An exciting piece of news or achievement",
            "A surprising interaction with someone",
            "A recent experience that changed your mood that day",
          ],
        },
      },
    ],
  },
  {
    title: "Open Mic",
    subtopics: [
      {
        title: "Free Conversation",
        description: {
          overview:
            "A completely open, unstructured conversation where two people—already slightly familiar with each other—can talk naturally about whatever comes to mind, building on past interactions without a set agenda.",
          vocabulary: [
            "Free Talk",
            "Natural Flow",
            "Follow-up",
            "Shared Context",
            "Curiosity",
            "Reflection",
            "Tangents",
          ],
          starters: [
            "Is there anything you’ve been meaning to bring up since we last talked?",
            "What’s been on your mind recently?",
            "Did anything from our previous conversations stick with you?",
            "What do you feel like talking about today?",
            "Has anything changed for you since the last time we spoke?",
          ],
          examples: [
            "Picking up on a topic mentioned in an earlier conversation",
            "Jumping between light topics and deeper reflections",
            "Sharing thoughts without needing a clear theme",
            "Letting one story naturally lead into another",
          ],
        },
      },
    ],
  },
];

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
