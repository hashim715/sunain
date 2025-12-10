import { prisma } from "../config/postgres";

const TOPICS = [
  {
    title: "Technology & Innovation",
    subtopics: [
      {
        title: "Artificial Intelligence",
        description: {
          overview:
            "Discuss the current state and future of AI, including machine learning, neural networks, and ethical considerations.",
          vocabulary: [
            "Machine Learning",
            "Neural Networks",
            "Deep Learning",
            "AI Ethics",
            "Automation",
          ],
          starters: [
            "What do you think is the most exciting AI development recently?",
            "How do you see AI changing your industry in the next 5 years?",
            "What are your thoughts on AI ethics and regulation?",
          ],
          examples: [
            "ChatGPT and language models",
            "Self-driving cars and autonomous systems",
            "AI in healthcare diagnostics",
          ],
        },
      },
      {
        title: "Blockchain & Web3",
        description: {
          overview:
            "Explore decentralized technologies, cryptocurrencies, and the future of the internet.",
          vocabulary: [
            "Blockchain",
            "Cryptocurrency",
            "Smart Contracts",
            "NFTs",
            "Decentralization",
          ],
          starters: [
            "What's your take on the future of blockchain technology?",
            "Have you experimented with any Web3 applications?",
            "How do you think decentralization will impact traditional systems?",
          ],
          examples: [
            "Bitcoin and cryptocurrency adoption",
            "Decentralized finance (DeFi) platforms",
            "NFTs and digital ownership",
          ],
        },
      },
      {
        title: "Quantum Computing",
        description: {
          overview:
            "Delve into quantum mechanics, quantum bits, and how this technology will revolutionize computing.",
          vocabulary: [
            "Quantum Bits",
            "Superposition",
            "Entanglement",
            "Quantum Supremacy",
            "Q-bits",
          ],
          starters: [
            "What problems do you think quantum computing will solve first?",
            "How far away do you think practical quantum computers are?",
          ],
          examples: [
            "Drug discovery and molecular simulation",
            "Breaking current encryption methods",
          ],
        },
      },
      {
        title: "Space Technology",
        description: {
          overview:
            "Discuss space exploration, satellite technology, and the commercialization of space.",
          vocabulary: [
            "SpaceX",
            "Satellites",
            "Mars Mission",
            "Space Tourism",
            "Rocketry",
          ],
          starters: [
            "What excites you most about recent space exploration efforts?",
            "Do you think space tourism will become mainstream?",
          ],
          examples: [
            "SpaceX's Starship program",
            "James Webb Space Telescope discoveries",
          ],
        },
      },
      {
        title: "Cybersecurity",
        description: {
          overview:
            "Talk about data protection, hacking, privacy, and digital security in the modern age.",
          vocabulary: [
            "Encryption",
            "Phishing",
            "Zero Trust",
            "VPN",
            "Firewall",
          ],
          starters: [
            "What do you think is the biggest cybersecurity threat today?",
            "How do you protect your personal data online?",
          ],
          examples: [
            "Ransomware attacks on corporations",
            "Privacy concerns with social media",
          ],
        },
      },
    ],
  },
  {
    title: "Travel & Adventure",
    subtopics: [
      {
        title: "Solo Travel Experiences",
        description: {
          overview:
            "Share stories and insights about traveling alone, the freedom it brings, and lessons learned.",
          vocabulary: [
            "Backpacking",
            "Hostel Culture",
            "Digital Nomad",
            "Solo Adventure",
            "Cultural Immersion",
          ],
          starters: [
            "What was your most memorable solo travel experience?",
            "How did traveling alone change your perspective?",
            "What advice would you give to first-time solo travelers?",
          ],
          examples: [
            "Backpacking through Southeast Asia",
            "Road-tripping across the US",
            "Living as a digital nomad in Bali",
          ],
        },
      },
      {
        title: "Hidden Travel Gems",
        description: {
          overview:
            "Discuss underrated destinations that are worth visiting but often overlooked by tourists.",
          vocabulary: [
            "Off the Beaten Path",
            "Local Secrets",
            "Hidden Gems",
            "Undiscovered",
            "Authentic",
          ],
          starters: [
            "What's the most underrated place you've ever visited?",
            "How do you discover hidden gems when traveling?",
          ],
          examples: [
            "Small towns in Portugal",
            "Remote islands in Indonesia",
            "Lesser-known national parks",
          ],
        },
      },
      {
        title: "Cultural Experiences",
        description: {
          overview:
            "Talk about immersing yourself in different cultures, traditions, and local customs.",
          vocabulary: [
            "Cultural Exchange",
            "Traditions",
            "Local Customs",
            "Festival",
            "Heritage",
          ],
          starters: [
            "What cultural experience had the biggest impact on you?",
            "How do you respectfully engage with local cultures?",
          ],
          examples: [
            "Attending a traditional tea ceremony in Japan",
            "Celebrating Holi in India",
          ],
        },
      },
      {
        title: "Adventure Sports",
        description: {
          overview:
            "Discuss thrilling activities like skydiving, scuba diving, mountaineering, and more.",
          vocabulary: [
            "Adrenaline",
            "Extreme Sports",
            "Rock Climbing",
            "Paragliding",
            "Surfing",
          ],
          starters: [
            "What's the most adventurous thing you've done while traveling?",
            "Would you try skydiving or bungee jumping?",
          ],
          examples: [
            "Skydiving in New Zealand",
            "Scuba diving in the Great Barrier Reef",
          ],
        },
      },
      {
        title: "Budget Travel Tips",
        description: {
          overview:
            "Share strategies for traveling on a budget without sacrificing experience.",
          vocabulary: [
            "Budget Airline",
            "Couchsurfing",
            "Travel Hacks",
            "Free Walking Tours",
            "Hostels",
          ],
          starters: [
            "What's your best budget travel hack?",
            "How do you save money while traveling?",
          ],
          examples: [
            "Using credit card points for flights",
            "Staying in hostels and cooking your own meals",
          ],
        },
      },
    ],
  },
  {
    title: "Food & Cooking",
    subtopics: [
      {
        title: "Home Cooking Tips",
        description: {
          overview:
            "Discuss favorite recipes, cooking techniques, and tips for making delicious meals at home.",
          vocabulary: [
            "Mise en Place",
            "Sauté",
            "Braise",
            "Recipe",
            "Ingredient",
          ],
          starters: [
            "What's your go-to home-cooked meal?",
            "Do you have any cooking tips for beginners?",
          ],
          examples: [
            "Perfecting pasta carbonara",
            "Making fresh bread from scratch",
          ],
        },
      },
      {
        title: "Global Cuisines",
        description: {
          overview:
            "Explore different food cultures from around the world and what makes them unique.",
          vocabulary: [
            "Authentic",
            "Fusion",
            "Street Food",
            "Regional Dishes",
            "Culinary Tradition",
          ],
          starters: [
            "What's your favorite cuisine and why?",
            "Have you ever tried making authentic dishes from another country?",
          ],
          examples: ["Thai street food", "Italian regional specialties"],
        },
      },
      {
        title: "Dietary Lifestyles",
        description: {
          overview:
            "Discuss vegetarian, vegan, keto, paleo, and other dietary choices and their benefits.",
          vocabulary: ["Plant-Based", "Keto", "Paleo", "Gluten-Free", "Macros"],
          starters: [
            "Have you ever tried a specific diet? How did it go?",
            "What are the biggest challenges of your dietary lifestyle?",
          ],
          examples: [
            "Transitioning to a plant-based diet",
            "Benefits and challenges of keto",
          ],
        },
      },
      {
        title: "Food & Memory",
        description: {
          overview:
            "Talk about how certain foods connect to memories, traditions, and emotions.",
          vocabulary: [
            "Comfort Food",
            "Nostalgia",
            "Family Recipe",
            "Tradition",
            "Childhood",
          ],
          starters: [
            "What's a dish that brings back childhood memories?",
            "Do you have a family recipe that's been passed down?",
          ],
          examples: ["Grandma's apple pie", "Mom's Sunday roast"],
        },
      },
      {
        title: "Coffee & Tea Culture",
        description: {
          overview:
            "Discuss the rituals, flavors, and culture surrounding coffee and tea around the world.",
          vocabulary: [
            "Espresso",
            "French Press",
            "Matcha",
            "Oolong",
            "Pour Over",
          ],
          starters: [
            "Are you more of a coffee or tea person?",
            "What's your favorite way to brew coffee or tea?",
          ],
          examples: ["Japanese tea ceremonies", "Italian espresso culture"],
        },
      },
    ],
  },
  {
    title: "Health & Wellness",
    subtopics: [
      {
        title: "Mental Health",
        description: {
          overview:
            "Discuss mindfulness, stress management, therapy, and maintaining mental wellbeing.",
          vocabulary: [
            "Mindfulness",
            "Meditation",
            "Therapy",
            "Self-Care",
            "Anxiety",
          ],
          starters: [
            "What do you do to manage stress?",
            "How do you practice self-care?",
          ],
          examples: [
            "Daily meditation practices",
            "Journaling for mental clarity",
          ],
        },
      },
      {
        title: "Fitness Routines",
        description: {
          overview:
            "Share workout routines, fitness goals, and tips for staying active.",
          vocabulary: [
            "Strength Training",
            "Cardio",
            "HIIT",
            "Yoga",
            "CrossFit",
          ],
          starters: [
            "What's your current fitness routine?",
            "How do you stay motivated to work out?",
          ],
          examples: ["Morning yoga practice", "Building a home gym"],
        },
      },
      {
        title: "Nutrition & Diet",
        description: {
          overview:
            "Talk about healthy eating habits, meal planning, and nutritional science.",
          vocabulary: [
            "Macros",
            "Micronutrients",
            "Meal Prep",
            "Whole Foods",
            "Supplements",
          ],
          starters: [
            "How do you approach meal planning?",
            "What nutritional changes have made a difference for you?",
          ],
          examples: [
            "Tracking macronutrients",
            "Incorporating more vegetables",
          ],
        },
      },
      {
        title: "Sleep & Recovery",
        description: {
          overview:
            "Discuss the importance of sleep, recovery techniques, and rest strategies.",
          vocabulary: [
            "Sleep Hygiene",
            "REM Sleep",
            "Recovery",
            "Circadian Rhythm",
            "Rest Day",
          ],
          starters: [
            "How do you prioritize sleep in your routine?",
            "What helps you get better quality sleep?",
          ],
          examples: [
            "Creating a bedtime routine",
            "Using sleep tracking devices",
          ],
        },
      },
      {
        title: "Holistic Wellness",
        description: {
          overview:
            "Explore alternative medicine, natural remedies, and mind-body connections.",
          vocabulary: [
            "Holistic",
            "Acupuncture",
            "Herbal Medicine",
            "Mind-Body",
            "Ayurveda",
          ],
          starters: [
            "Have you tried any alternative wellness practices?",
            "What's your view on holistic health?",
          ],
          examples: [
            "Trying acupuncture for pain relief",
            "Using essential oils",
          ],
        },
      },
    ],
  },
  {
    title: "Arts & Creativity",
    subtopics: [
      {
        title: "Creative Writing",
        description: {
          overview:
            "Discuss storytelling, poetry, journaling, and the craft of writing.",
          vocabulary: [
            "Narrative",
            "Character Development",
            "Plot",
            "Voice",
            "Draft",
          ],
          starters: [
            "What inspires your writing?",
            "Do you have a writing routine?",
          ],
          examples: [
            "Writing morning pages",
            "Developing fictional characters",
          ],
        },
      },
      {
        title: "Visual Arts",
        description: {
          overview:
            "Talk about painting, drawing, photography, and other visual mediums.",
          vocabulary: [
            "Composition",
            "Palette",
            "Perspective",
            "Medium",
            "Exhibition",
          ],
          starters: [
            "What's your preferred artistic medium?",
            "How did you develop your artistic style?",
          ],
          examples: ["Oil painting landscapes", "Street photography"],
        },
      },
      {
        title: "Music & Sound",
        description: {
          overview:
            "Discuss making music, learning instruments, and the role of sound in creativity.",
          vocabulary: [
            "Melody",
            "Harmony",
            "Rhythm",
            "Composition",
            "Acoustics",
          ],
          starters: [
            "What instrument have you always wanted to learn?",
            "How does music influence your creativity?",
          ],
          examples: ["Learning guitar online", "Producing electronic music"],
        },
      },
      {
        title: "Performing Arts",
        description: {
          overview: "Talk about theater, dance, improv, and live performance.",
          vocabulary: [
            "Stage Presence",
            "Improvisation",
            "Choreography",
            "Performance",
            "Audience",
          ],
          starters: [
            "Have you ever performed on stage?",
            "What draws you to performing arts?",
          ],
          examples: ["Community theater productions", "Dance performances"],
        },
      },
      {
        title: "Creative Process",
        description: {
          overview:
            "Discuss how you approach creativity, overcome blocks, and find inspiration.",
          vocabulary: [
            "Inspiration",
            "Creative Block",
            "Flow State",
            "Process",
            "Iteration",
          ],
          starters: [
            "How do you overcome creative blocks?",
            "What's your creative process like?",
          ],
          examples: [
            "Morning creative rituals",
            "Finding inspiration in nature",
          ],
        },
      },
    ],
  },
  {
    title: "Career & Professional Development",
    subtopics: [
      {
        title: "Remote Work Culture",
        description: {
          overview:
            "Discuss the rise of remote work, productivity strategies, and work-life balance in distributed teams.",
          vocabulary: [
            "Asynchronous Communication",
            "Digital Nomad",
            "Hybrid Model",
            "Time Zone Management",
            "Virtual Collaboration",
          ],
          starters: [
            "How has remote work changed your productivity?",
            "What tools do you use to stay connected with your team?",
            "Do you prefer remote, hybrid, or in-office work?",
          ],
          examples: [
            "Managing a global team across time zones",
            "Creating effective remote onboarding",
            "Building team culture virtually",
          ],
        },
      },
      {
        title: "Career Transitions",
        description: {
          overview:
            "Talk about switching careers, upskilling, and navigating professional changes.",
          vocabulary: [
            "Career Pivot",
            "Transferable Skills",
            "Reskilling",
            "Portfolio Career",
            "Sabbatical",
          ],
          starters: [
            "Have you ever changed career paths?",
            "What skills are you currently developing?",
            "How do you approach learning new professional skills?",
          ],
          examples: [
            "Transitioning from corporate to freelance",
            "Moving into tech from a different industry",
            "Taking a sabbatical to explore new interests",
          ],
        },
      },
      {
        title: "Leadership & Management",
        description: {
          overview:
            "Explore leadership styles, team management, and developing as a leader.",
          vocabulary: [
            "Servant Leadership",
            "Emotional Intelligence",
            "Delegation",
            "Feedback Culture",
            "Mentorship",
          ],
          starters: [
            "What leadership style resonates with you?",
            "How do you handle difficult conversations at work?",
            "What makes a great manager in your opinion?",
          ],
          examples: [
            "Building psychological safety in teams",
            "Giving constructive feedback effectively",
            "Developing future leaders",
          ],
        },
      },
      {
        title: "Networking & Personal Branding",
        description: {
          overview:
            "Discuss building professional connections and establishing your personal brand.",
          vocabulary: [
            "Thought Leadership",
            "Professional Network",
            "LinkedIn Strategy",
            "Elevator Pitch",
            "Personal Brand",
          ],
          starters: [
            "How do you approach networking?",
            "What's your personal brand statement?",
            "Do you actively share your expertise online?",
          ],
          examples: [
            "Building a following on LinkedIn",
            "Speaking at industry conferences",
            "Creating content in your niche",
          ],
        },
      },
      {
        title: "Workplace Challenges",
        description: {
          overview:
            "Address common workplace issues like burnout, office politics, and conflict resolution.",
          vocabulary: [
            "Burnout",
            "Imposter Syndrome",
            "Work-Life Integration",
            "Conflict Management",
            "Professional Boundaries",
          ],
          starters: [
            "How do you deal with workplace stress?",
            "Have you experienced imposter syndrome?",
            "What's your strategy for maintaining boundaries?",
          ],
          examples: [
            "Recovering from burnout",
            "Navigating difficult coworkers",
            "Setting healthy work boundaries",
          ],
        },
      },
    ],
  },
  {
    title: "Science & Nature",
    subtopics: [
      {
        title: "Climate Change & Sustainability",
        description: {
          overview:
            "Discuss environmental issues, sustainable living, and climate action.",
          vocabulary: [
            "Carbon Footprint",
            "Renewable Energy",
            "Circular Economy",
            "Zero Waste",
            "Climate Adaptation",
          ],
          starters: [
            "What changes have you made to live more sustainably?",
            "How do you think we can address climate change?",
            "What environmental issue concerns you most?",
          ],
          examples: [
            "Reducing plastic consumption",
            "Supporting renewable energy initiatives",
            "Local environmental activism",
          ],
        },
      },
      {
        title: "Wildlife & Conservation",
        description: {
          overview:
            "Talk about wildlife protection, endangered species, and conservation efforts.",
          vocabulary: [
            "Biodiversity",
            "Habitat Conservation",
            "Endangered Species",
            "Ecosystem",
            "Wildlife Corridor",
          ],
          starters: [
            "What's your favorite animal and why?",
            "Have you participated in any conservation efforts?",
            "What wildlife have you encountered in nature?",
          ],
          examples: [
            "Volunteer wildlife rehabilitation",
            "Protecting local ecosystems",
            "Safari experiences",
          ],
        },
      },
      {
        title: "Astronomy & Cosmology",
        description: {
          overview:
            "Explore the universe, stars, planets, and our place in the cosmos.",
          vocabulary: [
            "Exoplanets",
            "Black Holes",
            "Dark Matter",
            "Cosmic Radiation",
            "Multiverse",
          ],
          starters: [
            "What fascinates you most about space?",
            "Do you think we'll find extraterrestrial life?",
            "Have you ever used a telescope?",
          ],
          examples: [
            "Stargazing experiences",
            "Recent astronomical discoveries",
            "Theories about the universe's origin",
          ],
        },
      },
      {
        title: "Human Biology & Medicine",
        description: {
          overview:
            "Discuss medical breakthroughs, how the body works, and health science.",
          vocabulary: [
            "Immunology",
            "Gene Therapy",
            "Microbiome",
            "Neuroscience",
            "Regenerative Medicine",
          ],
          starters: [
            "What recent medical breakthrough excites you?",
            "How do you think healthcare will change in the future?",
            "What aspect of human biology fascinates you?",
          ],
          examples: [
            "CRISPR gene editing",
            "Personalized medicine",
            "Brain-computer interfaces",
          ],
        },
      },
      {
        title: "Ocean Exploration",
        description: {
          overview:
            "Delve into marine life, ocean conservation, and deep-sea discoveries.",
          vocabulary: [
            "Marine Biology",
            "Coral Reef",
            "Ocean Acidification",
            "Deep Sea",
            "Marine Conservation",
          ],
          starters: [
            "What ocean creature interests you most?",
            "Have you ever been scuba diving?",
            "How can we better protect our oceans?",
          ],
          examples: [
            "Diving in coral reefs",
            "Deep-sea exploration discoveries",
            "Ocean cleanup initiatives",
          ],
        },
      },
    ],
  },
  {
    title: "Education & Learning",
    subtopics: [
      {
        title: "Lifelong Learning",
        description: {
          overview:
            "Discuss continuous education, online courses, and personal development.",
          vocabulary: [
            "Self-Directed Learning",
            "MOOCs",
            "Microlearning",
            "Skill Acquisition",
            "Learning Agility",
          ],
          starters: [
            "What are you currently learning?",
            "How do you approach learning new skills?",
            "What's the best course you've ever taken?",
          ],
          examples: [
            "Taking online certifications",
            "Learning a new language app-based",
            "Attending workshops and seminars",
          ],
        },
      },
      {
        title: "Language Learning",
        description: {
          overview:
            "Share experiences and tips for learning new languages and cultural immersion.",
          vocabulary: [
            "Polyglot",
            "Immersion",
            "Language Exchange",
            "Fluency",
            "Pronunciation",
          ],
          starters: [
            "What languages do you speak or want to learn?",
            "How do you practice a new language?",
            "What's the hardest part of language learning for you?",
          ],
          examples: [
            "Using language exchange apps",
            "Living abroad to learn a language",
            "Learning through TV shows and music",
          ],
        },
      },
      {
        title: "Teaching Methods",
        description: {
          overview:
            "Explore different educational approaches and effective teaching strategies.",
          vocabulary: [
            "Pedagogy",
            "Active Learning",
            "Differentiation",
            "Assessment",
            "Educational Technology",
          ],
          starters: [
            "What was your best learning experience?",
            "How do you think education should evolve?",
            "What teaching method works best for you?",
          ],
          examples: [
            "Project-based learning",
            "Flipped classroom models",
            "Gamification in education",
          ],
        },
      },
      {
        title: "Educational Technology",
        description: {
          overview:
            "Discuss how technology is transforming education and learning experiences.",
          vocabulary: [
            "EdTech",
            "Virtual Reality Learning",
            "Adaptive Learning",
            "Learning Management Systems",
            "AI Tutors",
          ],
          starters: [
            "How has technology changed how you learn?",
            "What educational apps do you use?",
            "Do you think VR will transform education?",
          ],
          examples: [
            "Using AI for personalized learning",
            "Virtual classrooms",
            "Educational YouTube channels",
          ],
        },
      },
      {
        title: "Academic Research",
        description: {
          overview:
            "Talk about research methodologies, academic publishing, and scholarly work.",
          vocabulary: [
            "Peer Review",
            "Methodology",
            "Literature Review",
            "Hypothesis",
            "Publication",
          ],
          starters: [
            "What research topics interest you?",
            "Have you conducted any research projects?",
            "What makes research compelling to you?",
          ],
          examples: [
            "Conducting field research",
            "Publishing in academic journals",
            "Collaborative research projects",
          ],
        },
      },
    ],
  },
  {
    title: "Philosophy & Psychology",
    subtopics: [
      {
        title: "Ethics & Morality",
        description: {
          overview:
            "Explore ethical frameworks, moral dilemmas, and philosophical questions.",
          vocabulary: [
            "Utilitarianism",
            "Moral Relativism",
            "Virtue Ethics",
            "Ethical Dilemma",
            "Social Contract",
          ],
          starters: [
            "What ethical framework guides your decisions?",
            "How do you approach moral dilemmas?",
            "What's a philosophical question that fascinates you?",
          ],
          examples: [
            "Trolley problem discussions",
            "Business ethics challenges",
            "Environmental ethics",
          ],
        },
      },
      {
        title: "Consciousness & Identity",
        description: {
          overview:
            "Discuss the nature of consciousness, self-awareness, and personal identity.",
          vocabulary: [
            "Consciousness",
            "Self-Awareness",
            "Ego",
            "Perception",
            "Existentialism",
          ],
          starters: [
            "What do you think makes up your identity?",
            "How do you define consciousness?",
            "What shapes who we are as individuals?",
          ],
          examples: [
            "Meditation and consciousness",
            "Near-death experiences",
            "The hard problem of consciousness",
          ],
        },
      },
      {
        title: "Happiness & Meaning",
        description: {
          overview:
            "Talk about finding purpose, happiness, and living a meaningful life.",
          vocabulary: [
            "Eudaimonia",
            "Purpose",
            "Fulfillment",
            "Authenticity",
            "Life Satisfaction",
          ],
          starters: [
            "What gives your life meaning?",
            "How do you define happiness?",
            "What's your philosophy on living well?",
          ],
          examples: [
            "Finding purpose through work",
            "Pursuing meaningful relationships",
            "Living according to values",
          ],
        },
      },
      {
        title: "Cognitive Biases",
        description: {
          overview:
            "Explore how our minds work, common thinking errors, and decision-making.",
          vocabulary: [
            "Confirmation Bias",
            "Dunning-Kruger Effect",
            "Anchoring",
            "Heuristics",
            "Rationality",
          ],
          starters: [
            "What cognitive biases do you notice in yourself?",
            "How do you make important decisions?",
            "What helps you think more clearly?",
          ],
          examples: [
            "Recognizing your own biases",
            "Improving critical thinking",
            "Avoiding common thinking traps",
          ],
        },
      },
      {
        title: "Social Psychology",
        description: {
          overview:
            "Discuss human behavior in groups, social influence, and interpersonal dynamics.",
          vocabulary: [
            "Group Dynamics",
            "Social Influence",
            "Conformity",
            "Attribution Theory",
            "Social Identity",
          ],
          starters: [
            "How do groups influence individual behavior?",
            "What social psychology concepts fascinate you?",
            "How do you handle peer pressure?",
          ],
          examples: [
            "Bystander effect in real life",
            "Understanding group think",
            "Social media psychology",
          ],
        },
      },
    ],
  },
  {
    title: "Hobbies & Collections",
    subtopics: [
      {
        title: "Photography",
        description: {
          overview:
            "Discuss photography techniques, equipment, and capturing moments.",
          vocabulary: [
            "Aperture",
            "Composition",
            "ISO",
            "Golden Hour",
            "Post-Processing",
          ],
          starters: [
            "What do you like to photograph?",
            "Are you into film or digital photography?",
            "What's your favorite photography technique?",
          ],
          examples: [
            "Street photography adventures",
            "Landscape photography trips",
            "Portrait sessions",
          ],
        },
      },
      {
        title: "Gardening",
        description: {
          overview:
            "Talk about growing plants, gardening techniques, and connecting with nature.",
          vocabulary: [
            "Propagation",
            "Soil Composition",
            "Companion Planting",
            "Perennials",
            "Pruning",
          ],
          starters: [
            "What are you growing in your garden?",
            "Do you have a green thumb?",
            "What's your favorite plant to grow?",
          ],
          examples: [
            "Starting a vegetable garden",
            "Indoor plant collections",
            "Sustainable gardening practices",
          ],
        },
      },
      {
        title: "Collecting",
        description: {
          overview: "Share your collections and the joy of finding rare items.",
          vocabulary: [
            "Rare Finds",
            "Vintage",
            "Mint Condition",
            "Curator",
            "Authentication",
          ],
          starters: [
            "What do you collect and why?",
            "What's your most prized item?",
            "How did you start your collection?",
          ],
          examples: [
            "Vintage record collections",
            "Comic book collecting",
            "Antique furniture hunting",
          ],
        },
      },
      {
        title: "DIY & Crafts",
        description: {
          overview:
            "Discuss handmade projects, crafting skills, and creative making.",
          vocabulary: [
            "Handmade",
            "Upcycling",
            "Craftsmanship",
            "DIY Projects",
            "Maker Movement",
          ],
          starters: [
            "What DIY projects are you working on?",
            "What crafts do you enjoy?",
            "Have you made anything you're proud of?",
          ],
          examples: [
            "Woodworking projects",
            "Knitting and crocheting",
            "Home renovation DIY",
          ],
        },
      },
      {
        title: "Board Games & Puzzles",
        description: {
          overview:
            "Talk about strategy games, puzzle solving, and game nights.",
          vocabulary: [
            "Strategy",
            "Game Mechanics",
            "Euro Games",
            "Cooperative Play",
            "Puzzle Logic",
          ],
          starters: [
            "What's your favorite board game?",
            "Do you prefer competitive or cooperative games?",
            "What puzzles are you into?",
          ],
          examples: [
            "Weekly game nights",
            "Jigsaw puzzle marathons",
            "Escape room experiences",
          ],
        },
      },
    ],
  },
  {
    title: "Pop Culture & Entertainment",
    subtopics: [
      {
        title: "Podcasts",
        description: {
          overview:
            "Discuss favorite podcasts, storytelling formats, and audio content.",
          vocabulary: [
            "True Crime",
            "Narrative Arc",
            "Interview Format",
            "Episodic",
            "Audio Documentary",
          ],
          starters: [
            "What podcasts are you listening to?",
            "What's your favorite podcast genre?",
            "Have you discovered any hidden gem podcasts?",
          ],
          examples: [
            "True crime investigations",
            "Comedy interview shows",
            "Educational deep-dives",
          ],
        },
      },
      {
        title: "Social Media Trends",
        description: {
          overview:
            "Talk about viral content, social media culture, and digital trends.",
          vocabulary: [
            "Viral Content",
            "Algorithm",
            "Influencer",
            "Content Creator",
            "Engagement",
          ],
          starters: [
            "What social media platforms do you use most?",
            "Have you seen any interesting trends lately?",
            "How do you curate your feed?",
          ],
          examples: [
            "TikTok challenges",
            "Instagram vs reality",
            "YouTube creator economy",
          ],
        },
      },
      {
        title: "Comics & Manga",
        description: {
          overview:
            "Discuss graphic novels, manga series, and visual storytelling.",
          vocabulary: [
            "Graphic Novel",
            "Panel Layout",
            "Story Arc",
            "Manga",
            "Sequential Art",
          ],
          starters: [
            "What comics or manga are you reading?",
            "Who's your favorite comic book character?",
            "Do you prefer Western comics or manga?",
          ],
          examples: [
            "Marvel vs DC debates",
            "Indie comic discoveries",
            "Anime adaptations",
          ],
        },
      },
      {
        title: "Memes & Internet Culture",
        description: {
          overview:
            "Explore online humor, internet phenomena, and digital culture.",
          vocabulary: [
            "Meme Format",
            "Viral Moment",
            "Internet Slang",
            "Online Community",
            "Digital Native",
          ],
          starters: [
            "What's your favorite meme format?",
            "How has internet culture changed recently?",
            "What online communities are you part of?",
          ],
          examples: [
            "Nostalgic internet moments",
            "Reddit communities",
            "Discord server culture",
          ],
        },
      },
      {
        title: "Streaming & Binge Culture",
        description: {
          overview:
            "Discuss streaming platforms, viewing habits, and entertainment consumption.",
          vocabulary: [
            "Binge-Watching",
            "Streaming Platform",
            "Original Content",
            "Recommendation Algorithm",
            "Watch Party",
          ],
          starters: [
            "What are you binge-watching right now?",
            "Which streaming service do you use most?",
            "How do you discover new shows?",
          ],
          examples: [
            "Netflix hidden gems",
            "Streaming service comparisons",
            "Virtual watch parties",
          ],
        },
      },
    ],
  },
  {
    title: "Home & Lifestyle",
    subtopics: [
      {
        title: "Interior Design",
        description: {
          overview:
            "Discuss home decor, design principles, and creating comfortable spaces.",
          vocabulary: [
            "Minimalism",
            "Feng Shui",
            "Color Palette",
            "Statement Piece",
            "Spatial Planning",
          ],
          starters: [
            "How would you describe your home style?",
            "What's your approach to decorating?",
            "Any recent home makeover projects?",
          ],
          examples: [
            "Minimalist apartment tours",
            "DIY home decor",
            "Thrifted furniture makeovers",
          ],
        },
      },
      {
        title: "Organization & Decluttering",
        description: {
          overview:
            "Share tips on organizing spaces, minimalism, and maintaining order.",
          vocabulary: [
            "Marie Kondo Method",
            "Decluttering",
            "Storage Solutions",
            "Minimalism",
            "Organization Systems",
          ],
          starters: [
            "How do you stay organized?",
            "Have you tried any decluttering methods?",
            "What's your biggest organization challenge?",
          ],
          examples: [
            "KonMari method success",
            "Closet organization hacks",
            "Digital decluttering",
          ],
        },
      },
      {
        title: "Smart Home Technology",
        description: {
          overview:
            "Talk about home automation, IoT devices, and connected living.",
          vocabulary: [
            "Home Automation",
            "IoT Devices",
            "Smart Assistant",
            "Connected Home",
            "Energy Efficiency",
          ],
          starters: [
            "What smart home devices do you have?",
            "How has automation changed your daily routine?",
            "What's the most useful smart home feature?",
          ],
          examples: [
            "Voice-controlled lighting",
            "Smart thermostat savings",
            "Security camera systems",
          ],
        },
      },
      {
        title: "Sustainable Living",
        description: {
          overview:
            "Discuss eco-friendly choices, reducing waste, and sustainable practices at home.",
          vocabulary: [
            "Zero Waste",
            "Composting",
            "Eco-Friendly",
            "Sustainable Products",
            "Reduce Reuse Recycle",
          ],
          starters: [
            "What sustainable swaps have you made?",
            "How do you reduce waste at home?",
            "What eco-friendly products do you love?",
          ],
          examples: [
            "Starting a compost bin",
            "Reusable product switches",
            "Energy-efficient upgrades",
          ],
        },
      },
      {
        title: "Urban Living vs Country Life",
        description: {
          overview:
            "Compare lifestyles, pros and cons, and experiences of city vs rural living.",
          vocabulary: [
            "Urbanization",
            "Rural Lifestyle",
            "City Amenities",
            "Suburban",
            "Community",
          ],
          starters: [
            "Do you prefer city or country living?",
            "What do you love about where you live?",
            "Have you considered moving to a different environment?",
          ],
          examples: [
            "City to country transitions",
            "Urban gardening solutions",
            "Small-town community life",
          ],
        },
      },
    ],
  },
  {
    title: "Parenting & Family",
    subtopics: [
      {
        title: "Parenting Approaches",
        description: {
          overview:
            "Discuss different parenting styles, challenges, and raising children.",
          vocabulary: [
            "Gentle Parenting",
            "Attachment Parenting",
            "Co-Parenting",
            "Discipline",
            "Child Development",
          ],
          starters: [
            "What's your parenting philosophy?",
            "What parenting challenges are you facing?",
            "How do you approach discipline?",
          ],
          examples: [
            "Positive reinforcement strategies",
            "Screen time guidelines",
            "Teaching emotional intelligence",
          ],
        },
      },
      {
        title: "Work-Life Balance with Kids",
        description: {
          overview:
            "Talk about juggling career and family, time management, and priorities.",
          vocabulary: [
            "Working Parent",
            "Quality Time",
            "Childcare",
            "Flexibility",
            "Family Time",
          ],
          starters: [
            "How do you balance work and family?",
            "What helps you stay present with your kids?",
            "What's your childcare situation?",
          ],
          examples: [
            "Remote work with kids",
            "Creating family routines",
            "Weekend quality time activities",
          ],
        },
      },
      {
        title: "Family Traditions",
        description: {
          overview:
            "Share family customs, holiday traditions, and creating memories.",
          vocabulary: [
            "Family Rituals",
            "Holiday Traditions",
            "Legacy",
            "Celebrations",
            "Generational",
          ],
          starters: [
            "What family traditions are special to you?",
            "How do you celebrate holidays?",
            "What traditions are you creating?",
          ],
          examples: [
            "Annual family vacations",
            "Holiday cooking traditions",
            "Weekly family game nights",
          ],
        },
      },
      {
        title: "Extended Family Dynamics",
        description: {
          overview:
            "Discuss relationships with extended family, boundaries, and multigenerational living.",
          vocabulary: [
            "Extended Family",
            "In-Laws",
            "Family Boundaries",
            "Multigenerational",
            "Family Dynamics",
          ],
          starters: [
            "How often do you see extended family?",
            "How do you navigate family relationships?",
            "What role do grandparents play in your life?",
          ],
          examples: [
            "Managing different parenting styles",
            "Holiday coordination",
            "Caring for aging parents",
          ],
        },
      },
      {
        title: "Education Choices",
        description: {
          overview:
            "Talk about schooling options, homeschooling, and educational decisions.",
          vocabulary: [
            "Homeschooling",
            "Public vs Private",
            "Alternative Education",
            "Curriculum",
            "Learning Style",
          ],
          starters: [
            "What school or education path did you choose?",
            "How do you support your child's learning?",
            "What educational philosophy appeals to you?",
          ],
          examples: [
            "Montessori education",
            "Homeschool co-ops",
            "Gifted programs",
          ],
        },
      },
    ],
  },
  {
    title: "Sports & Outdoor Activities",
    subtopics: [
      {
        title: "Team Sports",
        description: {
          overview:
            "Discuss playing or watching team sports, strategy, and competition.",
          vocabulary: [
            "Teamwork",
            "Strategy",
            "Competition",
            "Championship",
            "Sportsmanship",
          ],
          starters: [
            "What sports do you play or follow?",
            "What's your favorite team?",
            "Have you played on any memorable teams?",
          ],
          examples: [
            "Rec league experiences",
            "Following professional sports",
            "Coaching youth sports",
          ],
        },
      },
      {
        title: "Hiking & Camping",
        description: {
          overview:
            "Share outdoor adventures, trail recommendations, and camping experiences.",
          vocabulary: [
            "Trail Blazing",
            "Backcountry",
            "Camping Gear",
            "Summit",
            "Wilderness",
          ],
          starters: [
            "What's your favorite hiking trail?",
            "Do you prefer backpacking or car camping?",
            "What's your most memorable outdoor adventure?",
          ],
          examples: [
            "Thru-hiking experiences",
            "Weekend camping trips",
            "National park visits",
          ],
        },
      },
      {
        title: "Water Sports",
        description: {
          overview:
            "Talk about surfing, swimming, kayaking, and other water activities.",
          vocabulary: [
            "Surfing",
            "Kayaking",
            "Stand-Up Paddleboard",
            "Snorkeling",
            "White Water",
          ],
          starters: [
            "What water sports do you enjoy?",
            "Have you ever tried surfing?",
            "What's your favorite body of water?",
          ],
          examples: [
            "Learning to surf",
            "Kayaking adventures",
            "Open water swimming",
          ],
        },
      },
      {
        title: "Winter Sports",
        description: {
          overview:
            "Discuss skiing, snowboarding, and other cold-weather activities.",
          vocabulary: [
            "Powder",
            "Black Diamond",
            "Apres-Ski",
            "Backcountry Skiing",
            "Ice Skating",
          ],
          starters: [
            "Do you ski or snowboard?",
            "What's your favorite winter activity?",
            "What's the best ski resort you've been to?",
          ],
          examples: [
            "Learning to snowboard",
            "Cross-country skiing",
            "Winter mountaineering",
          ],
        },
      },
      {
        title: "Running & Endurance",
        description: {
          overview:
            "Talk about running, marathons, ultramarathons, and building endurance.",
          vocabulary: [
            "Marathon",
            "Pace",
            "Endurance Training",
            "Runner's High",
            "Split Times",
          ],
          starters: [
            "What distance do you typically run?",
            "Have you run any races?",
            "What's your training routine like?",
          ],
          examples: [
            "Training for first marathon",
            "Trail running adventures",
            "Local running clubs",
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
