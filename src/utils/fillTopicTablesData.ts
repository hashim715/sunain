import { prisma } from "../config/postgres";

// const TOPICS = [
//   {
//     title: "Technology & Innovation",
//     subtopics: [
//       {
//         title: "Artificial Intelligence & Machine Learning",
//         description: {
//           overview:
//             "Explore AI's evolution, from neural networks to AGI, and its transformative impact on society, ethics, and daily life.",
//           vocabulary: [
//             "Machine Learning",
//             "Neural Networks",
//             "Deep Learning",
//             "AI Ethics",
//             "Automation",
//             "AGI",
//             "Large Language Models",
//             "Reinforcement Learning",
//           ],
//           starters: [
//             "What AI breakthrough has surprised you most recently?",
//             "How is AI changing your industry or field?",
//             "What concerns do you have about AI development?",
//             "Do you use AI tools in your daily work?",
//           ],
//           examples: [
//             "ChatGPT and conversational AI",
//             "AI-generated art and creativity",
//             "Medical diagnosis systems",
//             "Autonomous vehicles",
//           ],
//         },
//       },
//       {
//         title: "Blockchain & Decentralized Systems",
//         description: {
//           overview:
//             "Discuss distributed ledger technology, cryptocurrency economics, smart contracts, and the shift toward decentralization.",
//           vocabulary: [
//             "Blockchain",
//             "Cryptocurrency",
//             "Smart Contracts",
//             "DeFi",
//             "Web3",
//             "Consensus Mechanisms",
//             "Tokenization",
//             "DAOs",
//           ],
//           starters: [
//             "What's your perspective on cryptocurrency as currency versus investment?",
//             "Have you explored any decentralized applications?",
//             "How do you see blockchain solving real-world problems?",
//             "What's your take on NFTs beyond the hype?",
//           ],
//           examples: [
//             "Ethereum and smart contract platforms",
//             "Bitcoin's role as digital gold",
//             "Decentralized finance protocols",
//             "Supply chain transparency solutions",
//           ],
//         },
//       },
//       {
//         title: "Quantum Computing & Physics",
//         description: {
//           overview:
//             "Dive into quantum mechanics applications, qubit technology, superposition, and how quantum systems will revolutionize computation.",
//           vocabulary: [
//             "Qubits",
//             "Superposition",
//             "Quantum Entanglement",
//             "Quantum Supremacy",
//             "Quantum Annealing",
//             "Decoherence",
//             "Quantum Algorithms",
//           ],
//           starters: [
//             "Which industries do you think quantum computing will disrupt first?",
//             "What quantum concepts fascinate you most?",
//             "How do you think quantum will change cryptography?",
//           ],
//           examples: [
//             "Drug discovery through molecular simulation",
//             "Optimization problems in logistics",
//             "Breaking current encryption standards",
//             "Weather prediction modeling",
//           ],
//         },
//       },
//       {
//         title: "Space Exploration & Commercialization",
//         description: {
//           overview:
//             "Examine space missions, satellite networks, asteroid mining, and humanity's expansion beyond Earth.",
//           vocabulary: [
//             "SpaceX",
//             "Orbital Mechanics",
//             "Mars Colonization",
//             "Space Tourism",
//             "Satellite Constellations",
//             "Reusable Rockets",
//             "Lagrange Points",
//           ],
//           starters: [
//             "Do you think Mars colonization is realistic in our lifetime?",
//             "What's the most exciting space mission currently underway?",
//             "Should space be commercialized or remain public domain?",
//           ],
//           examples: [
//             "Starship development and testing",
//             "James Webb Space Telescope discoveries",
//             "Starlink global internet coverage",
//             "Artemis lunar program",
//           ],
//         },
//       },
//       {
//         title: "Cybersecurity & Privacy",
//         description: {
//           overview:
//             "Discuss digital security threats, data privacy rights, encryption technologies, and protecting information in an interconnected world.",
//           vocabulary: [
//             "Zero-Day Exploit",
//             "End-to-End Encryption",
//             "Zero Trust Architecture",
//             "Biometric Security",
//             "Ransomware",
//             "Privacy by Design",
//             "Penetration Testing",
//           ],
//           starters: [
//             "How do you balance convenience with privacy?",
//             "What security practices do you follow religiously?",
//             "Have you been affected by data breaches?",
//             "What's your view on government surveillance?",
//           ],
//           examples: [
//             "Password managers and 2FA adoption",
//             "Privacy-focused alternatives to mainstream apps",
//             "Corporate data breach responses",
//             "Biometric authentication pros and cons",
//           ],
//         },
//       },
//       {
//         title: "Augmented & Virtual Reality",
//         description: {
//           overview:
//             "Explore immersive technologies, spatial computing, the metaverse concept, and how AR/VR is reshaping human interaction.",
//           vocabulary: [
//             "Spatial Computing",
//             "Metaverse",
//             "Mixed Reality",
//             "Haptic Feedback",
//             "6DOF",
//             "Avatar",
//             "Virtual Worlds",
//           ],
//           starters: [
//             "What VR experiences have impressed you?",
//             "Do you think the metaverse will take off?",
//             "How could AR improve your daily tasks?",
//           ],
//           examples: [
//             "VR training simulations",
//             "AR navigation overlays",
//             "Virtual collaboration spaces",
//             "Gaming in VR environments",
//           ],
//         },
//       },
//       {
//         title: "Internet of Things & Smart Devices",
//         description: {
//           overview:
//             "Discuss connected devices, sensor networks, edge computing, and how IoT is creating intelligent environments.",
//           vocabulary: [
//             "IoT Ecosystem",
//             "Edge Computing",
//             "Sensor Networks",
//             "MQTT Protocol",
//             "Smart Sensors",
//             "Device Mesh",
//             "Industrial IoT",
//           ],
//           starters: [
//             "What connected devices have genuinely improved your life?",
//             "What are the security risks of IoT?",
//             "Where do you see IoT having the biggest impact?",
//           ],
//           examples: [
//             "Smart city infrastructure",
//             "Wearable health monitors",
//             "Industrial automation sensors",
//             "Agricultural IoT applications",
//           ],
//         },
//       },
//       {
//         title: "Biotechnology & Genetic Engineering",
//         description: {
//           overview:
//             "Examine gene editing, synthetic biology, personalized medicine, and the ethical implications of manipulating life itself.",
//           vocabulary: [
//             "CRISPR",
//             "Gene Therapy",
//             "Synthetic Biology",
//             "Bioengineering",
//             "Genome Sequencing",
//             "Bioinformatics",
//             "Designer Babies",
//           ],
//           starters: [
//             "What excites you about gene editing technology?",
//             "Where should we draw ethical lines in genetic modification?",
//             "How will personalized medicine change healthcare?",
//           ],
//           examples: [
//             "CRISPR treating genetic diseases",
//             "Lab-grown meat production",
//             "Personalized cancer treatments",
//             "GMO crops and food security",
//           ],
//         },
//       },
//     ],
//   },
//   {
//     title: "Travel & Cultural Exploration",
//     subtopics: [
//       {
//         title: "Solo Travel & Self-Discovery",
//         description: {
//           overview:
//             "Discuss the transformative power of traveling alone, building confidence, and connecting with yourself through exploration.",
//           vocabulary: [
//             "Backpacking",
//             "Hostel Culture",
//             "Digital Nomad",
//             "Self-Discovery",
//             "Travel Independence",
//             "Wanderlust",
//             "Slow Travel",
//           ],
//           starters: [
//             "How did solo travel change your perspective on life?",
//             "What's the biggest lesson you learned traveling alone?",
//             "How do you handle loneliness while solo traveling?",
//             "What destination transformed you?",
//           ],
//           examples: [
//             "Six months backpacking through Southeast Asia",
//             "Camino de Santiago pilgrimage",
//             "Working remotely from different countries",
//             "Overcoming fears through solo adventures",
//           ],
//         },
//       },
//       {
//         title: "Off-the-Grid Destinations",
//         description: {
//           overview:
//             "Explore remote, undiscovered places far from tourist trails where authentic experiences and natural beauty await.",
//           vocabulary: [
//             "Remote Destinations",
//             "Authentic Experiences",
//             "Undiscovered",
//             "Local Communities",
//             "Sustainable Tourism",
//             "Adventure Travel",
//             "Cultural Preservation",
//           ],
//           starters: [
//             "What's the most remote place you've visited?",
//             "How do you find destinations before they become popular?",
//             "What makes a place feel authentically undiscovered?",
//           ],
//           examples: [
//             "Faroe Islands wilderness",
//             "Albanian Riviera villages",
//             "Mongolia's nomadic regions",
//             "Patagonian backcountry",
//           ],
//         },
//       },
//       {
//         title: "Cultural Immersion & Language",
//         description: {
//           overview:
//             "Dive deep into local cultures through language learning, homestays, and participating in daily life beyond surface-level tourism.",
//           vocabulary: [
//             "Cultural Exchange",
//             "Language Immersion",
//             "Homestay",
//             "Local Traditions",
//             "Cultural Sensitivity",
//             "Integration",
//             "Anthropological Travel",
//           ],
//           starters: [
//             "What's the deepest cultural connection you've made while traveling?",
//             "How has learning a local language changed your travel experience?",
//             "What cultural mistakes have you learned from?",
//           ],
//           examples: [
//             "Living with families in rural Japan",
//             "Learning Spanish in Colombian villages",
//             "Participating in Maasai ceremonies",
//             "Traditional cooking classes with locals",
//           ],
//         },
//       },
//       {
//         title: "Adventure & Extreme Travel",
//         description: {
//           overview:
//             "Pursue adrenaline-pumping experiences, pushing physical limits, and exploring Earth's most challenging environments.",
//           vocabulary: [
//             "Extreme Sports",
//             "Expedition",
//             "Mountaineering",
//             "Backcountry",
//             "Wilderness Survival",
//             "Adrenaline Tourism",
//             "Risk Management",
//           ],
//           starters: [
//             "What's the most physically demanding travel experience you've had?",
//             "How do you prepare for adventure travel?",
//             "What extreme activity is on your bucket list?",
//           ],
//           examples: [
//             "Climbing Mount Kilimanjaro",
//             "Kayaking through Norwegian fjords",
//             "Desert survival treks",
//             "Ice climbing in Iceland",
//           ],
//         },
//       },
//       {
//         title: "Sustainable & Responsible Travel",
//         description: {
//           overview:
//             "Focus on minimizing environmental impact, supporting local economies, and traveling ethically in an overtourism world.",
//           vocabulary: [
//             "Ecotourism",
//             "Carbon Offset",
//             "Overtourism",
//             "Ethical Travel",
//             "Community-Based Tourism",
//             "Leave No Trace",
//             "Regenerative Travel",
//           ],
//           starters: [
//             "How do you travel more sustainably?",
//             "What's your approach to overtouristed destinations?",
//             "How do you ensure your travel benefits local communities?",
//           ],
//           examples: [
//             "Choosing trains over flights",
//             "Supporting locally-owned accommodations",
//             "Volunteering on conservation projects",
//             "Avoiding exploitative tourism",
//           ],
//         },
//       },
//       {
//         title: "Long-Term Travel & Location Independence",
//         description: {
//           overview:
//             "Discuss extended travel lifestyles, building location-independent careers, and making travel a permanent way of life.",
//           vocabulary: [
//             "Digital Nomad",
//             "Slow Travel",
//             "Location Independence",
//             "Expat Life",
//             "Nomadic Lifestyle",
//             "Remote Work Abroad",
//             "Perpetual Travel",
//           ],
//           starters: [
//             "How do you sustain long-term travel financially?",
//             "What challenges come with constant movement?",
//             "How do you maintain relationships while traveling?",
//           ],
//           examples: [
//             "Working remotely across Southeast Asia",
//             "House-sitting around Europe",
//             "Building online businesses while traveling",
//             "Teaching English abroad",
//           ],
//         },
//       },
//       {
//         title: "Urban Exploration & City Life",
//         description: {
//           overview:
//             "Discover cities like a local, from hidden neighborhoods to underground culture, street art, and urban subcultures.",
//           vocabulary: [
//             "Urban Exploration",
//             "Street Culture",
//             "Gentrification",
//             "City Districts",
//             "Underground Scene",
//             "Urban Planning",
//             "Local Neighborhoods",
//           ],
//           starters: [
//             "How do you explore a city beyond tourist areas?",
//             "What's your favorite urban neighborhood you've discovered?",
//             "How do cities differ in their character and vibe?",
//           ],
//           examples: [
//             "Berlin's alternative culture scene",
//             "Tokyo's hidden alleyways",
//             "New York's diverse neighborhoods",
//             "Street art tours in Buenos Aires",
//           ],
//         },
//       },
//     ],
//   },
//   {
//     title: "Culinary Arts & Food Culture",
//     subtopics: [
//       {
//         title: "Cooking Techniques & Mastery",
//         description: {
//           overview:
//             "Master fundamental and advanced cooking methods, knife skills, flavor building, and the science behind perfect execution.",
//           vocabulary: [
//             "Mise en Place",
//             "Maillard Reaction",
//             "Emulsification",
//             "Braising",
//             "Reduction",
//             "Technique",
//             "Culinary Precision",
//           ],
//           starters: [
//             "What cooking technique took you longest to master?",
//             "How do you develop your palate?",
//             "What's your signature dish?",
//           ],
//           examples: [
//             "Perfect steak searing",
//             "French mother sauces",
//             "Bread fermentation timing",
//             "Wok hei in stir-frying",
//           ],
//         },
//       },
//       {
//         title: "Regional & Traditional Cuisines",
//         description: {
//           overview:
//             "Explore authentic regional cooking, traditional techniques passed through generations, and preserving culinary heritage.",
//           vocabulary: [
//             "Terroir",
//             "Authenticity",
//             "Culinary Heritage",
//             "Regional Specialties",
//             "Traditional Methods",
//             "Food History",
//             "Artisanal",
//           ],
//           starters: [
//             "What regional cuisine fascinates you most?",
//             "Have you learned cooking from family traditions?",
//             "How important is authenticity in cooking?",
//           ],
//           examples: [
//             "Neapolitan pizza certification",
//             "Sichuan flavor profiles",
//             "Southern BBQ traditions",
//             "Moroccan tagine cooking",
//           ],
//         },
//       },
//       {
//         title: "Plant-Based & Alternative Diets",
//         description: {
//           overview:
//             "Navigate vegetarian, vegan, and alternative eating approaches, exploring nutrition, ethics, and creative plant-based cooking.",
//           vocabulary: [
//             "Plant-Based",
//             "Whole Foods",
//             "Protein Alternatives",
//             "Nutritional Yeast",
//             "Seitan",
//             "Ethical Eating",
//             "Flexitarian",
//           ],
//           starters: [
//             "What inspired your dietary choices?",
//             "How do you ensure nutritional completeness?",
//             "What plant-based discoveries surprised you?",
//           ],
//           examples: [
//             "Creating umami without meat",
//             "Cashew-based cheese making",
//             "Legume-centered cuisines",
//             "Fermented plant proteins",
//           ],
//         },
//       },
//       {
//         title: "Food Science & Molecular Gastronomy",
//         description: {
//           overview:
//             "Apply scientific principles to cooking, experiment with textures, and push culinary boundaries through innovation.",
//           vocabulary: [
//             "Spherification",
//             "Sous Vide",
//             "Hydrocolloids",
//             "Nitrogen Freezing",
//             "Modernist Cuisine",
//             "Texture Modification",
//             "Culinary Chemistry",
//           ],
//           starters: [
//             "What molecular gastronomy techniques interest you?",
//             "How has food science changed your cooking?",
//             "What's the most unusual texture you've created?",
//           ],
//           examples: [
//             "Reverse spherification caviar",
//             "Precision temperature cooking",
//             "Foams and airs",
//             "Edible films and papers",
//           ],
//         },
//       },
//       {
//         title: "Fermentation & Preservation",
//         description: {
//           overview:
//             "Explore ancient preservation methods, fermentation science, probiotic benefits, and creating complex flavors through time.",
//           vocabulary: [
//             "Lacto-Fermentation",
//             "Koji",
//             "Pickling",
//             "Curing",
//             "Probiotics",
//             "Wild Fermentation",
//             "Aging",
//           ],
//           starters: [
//             "What fermentation projects are you working on?",
//             "How did you get into fermenting foods?",
//             "What's your longest-aged creation?",
//           ],
//           examples: [
//             "Sourdough starter maintenance",
//             "Kimchi and sauerkraut",
//             "Miso and tempeh making",
//             "Kombucha brewing",
//           ],
//         },
//       },
//       {
//         title: "Coffee, Tea & Beverage Craft",
//         description: {
//           overview:
//             "Dive into beverage preparation artistry, from coffee roasting and tea ceremony to cocktail mixology and brewing science.",
//           vocabulary: [
//             "Third Wave Coffee",
//             "Single Origin",
//             "Terroir",
//             "Cupping",
//             "Tea Ceremony",
//             "Mixology",
//             "Craft Beverages",
//           ],
//           starters: [
//             "How did you develop your coffee or tea ritual?",
//             "What's your preferred brewing method and why?",
//             "How do you explore new flavor profiles?",
//           ],
//           examples: [
//             "Pour-over technique perfection",
//             "Home coffee roasting",
//             "Gongfu tea brewing",
//             "Craft cocktail creation",
//           ],
//         },
//       },
//       {
//         title: "Food & Storytelling",
//         description: {
//           overview:
//             "Connect food to memory, identity, migration stories, and how meals create meaning beyond sustenance.",
//           vocabulary: [
//             "Food Memory",
//             "Culinary Identity",
//             "Comfort Food",
//             "Nostalgia",
//             "Family Recipes",
//             "Food Narrative",
//             "Cultural Gastronomy",
//           ],
//           starters: [
//             "What food takes you back to childhood?",
//             "How does food connect you to your heritage?",
//             "What meal tells your personal story?",
//           ],
//           examples: [
//             "Grandmother's secret recipe",
//             "Immigrant food adaptation",
//             "Holiday food traditions",
//             "Meals marking life transitions",
//           ],
//         },
//       },
//     ],
//   },
//   {
//     title: "Mental & Physical Wellbeing",
//     subtopics: [
//       {
//         title: "Mindfulness & Meditation Practices",
//         description: {
//           overview:
//             "Cultivate present-moment awareness, develop meditation skills, and integrate contemplative practices into daily life.",
//           vocabulary: [
//             "Mindfulness",
//             "Vipassana",
//             "Loving-Kindness",
//             "Body Scan",
//             "Meditation Practice",
//             "Present Moment",
//             "Non-Judgment",
//           ],
//           starters: [
//             "How has meditation changed your relationship with thoughts?",
//             "What meditation style resonates with you?",
//             "How do you maintain consistency in practice?",
//           ],
//           examples: [
//             "Morning meditation routines",
//             "Silent retreat experiences",
//             "Walking meditation",
//             "Mindfulness in daily activities",
//           ],
//         },
//       },
//       {
//         title: "Strength & Athletic Performance",
//         description: {
//           overview:
//             "Build physical capacity through progressive training, optimize performance, and understand exercise science.",
//           vocabulary: [
//             "Progressive Overload",
//             "Periodization",
//             "Functional Strength",
//             "Athletic Performance",
//             "Training Cycles",
//             "Power Development",
//             "Mobility Work",
//           ],
//           starters: [
//             "What training philosophy guides your workouts?",
//             "How do you track progress and set goals?",
//             "What's your approach to injury prevention?",
//           ],
//           examples: [
//             "Powerlifting programs",
//             "Olympic weightlifting",
//             "Calisthenics progression",
//             "Sport-specific training",
//           ],
//         },
//       },
//       {
//         title: "Nutrition & Metabolic Health",
//         description: {
//           overview:
//             "Understand nutritional biochemistry, optimize metabolic function, and build sustainable eating patterns.",
//           vocabulary: [
//             "Metabolic Health",
//             "Macronutrient Ratios",
//             "Insulin Sensitivity",
//             "Nutrient Timing",
//             "Bioavailability",
//             "Metabolic Flexibility",
//             "Nutritional Science",
//           ],
//           starters: [
//             "How do you approach nutritional optimization?",
//             "What dietary changes made the biggest impact?",
//             "How do you balance science with intuition?",
//           ],
//           examples: [
//             "Tracking blood glucose responses",
//             "Meal timing strategies",
//             "Micronutrient optimization",
//             "Elimination diet experiments",
//           ],
//         },
//       },
//       {
//         title: "Sleep Optimization & Circadian Health",
//         description: {
//           overview:
//             "Master sleep architecture, align with natural rhythms, and leverage rest for peak cognitive and physical function.",
//           vocabulary: [
//             "Sleep Architecture",
//             "Circadian Rhythm",
//             "Sleep Pressure",
//             "REM Cycles",
//             "Sleep Hygiene",
//             "Chronotype",
//             "Recovery Metrics",
//           ],
//           starters: [
//             "How have you optimized your sleep environment?",
//             "What's your understanding of your chronotype?",
//             "How do you measure sleep quality?",
//           ],
//           examples: [
//             "Light exposure protocols",
//             "Temperature optimization",
//             "Sleep tracking insights",
//             "Napping strategies",
//           ],
//         },
//       },
//       {
//         title: "Stress Management & Resilience",
//         description: {
//           overview:
//             "Develop psychological resilience, manage stress effectively, and build capacity to handle life's challenges.",
//           vocabulary: [
//             "Stress Response",
//             "Resilience Training",
//             "Psychological Flexibility",
//             "Stress Inoculation",
//             "Adaptive Coping",
//             "Emotional Regulation",
//             "Antifragility",
//           ],
//           starters: [
//             "How do you build resilience in difficult times?",
//             "What stress management tools actually work for you?",
//             "How has your relationship with stress evolved?",
//           ],
//           examples: [
//             "Cold exposure training",
//             "Breathwork practices",
//             "Cognitive reframing",
//             "Building stress tolerance",
//           ],
//         },
//       },
//       {
//         title: "Movement & Embodiment",
//         description: {
//           overview:
//             "Reconnect with physical sensation, explore diverse movement practices, and develop body awareness beyond exercise.",
//           vocabulary: [
//             "Somatic Awareness",
//             "Movement Practice",
//             "Embodiment",
//             "Kinesthetic Intelligence",
//             "Flow State",
//             "Body-Mind Connection",
//             "Movement Diversity",
//           ],
//           starters: [
//             "How do you cultivate body awareness?",
//             "What movement practices bring you joy?",
//             "How has your relationship with your body changed?",
//           ],
//           examples: [
//             "Dance as meditation",
//             "Martial arts practice",
//             "Yoga beyond asana",
//             "Natural movement training",
//           ],
//         },
//       },
//       {
//         title: "Integrative & Functional Health",
//         description: {
//           overview:
//             "Explore whole-person health approaches, root cause medicine, and integrating conventional and alternative therapies.",
//           vocabulary: [
//             "Functional Medicine",
//             "Root Cause Analysis",
//             "Integrative Approach",
//             "Systems Biology",
//             "Personalized Health",
//             "Bioindividuality",
//             "Holistic Treatment",
//           ],
//           starters: [
//             "How do you approach health optimization?",
//             "What role do complementary therapies play for you?",
//             "How do you work with your body's signals?",
//           ],
//           examples: [
//             "Functional lab testing",
//             "Acupuncture and TCM",
//             "Herbal medicine protocols",
//             "Lifestyle medicine practices",
//           ],
//         },
//       },
//     ],
//   },
//   {
//     title: "Creative Expression & Arts",
//     subtopics: [
//       {
//         title: "Writing & Literary Arts",
//         description: {
//           overview:
//             "Develop voice, craft stories, explore poetry, and navigate the writer's journey from blank page to published work.",
//           vocabulary: [
//             "Voice",
//             "Story Arc",
//             "Character Depth",
//             "Literary Device",
//             "Draft Revision",
//             "Writer's Craft",
//             "Narrative Structure",
//           ],
//           starters: [
//             "What's your writing process from idea to completion?",
//             "How did you find your unique voice?",
//             "What's the hardest part of writing for you?",
//           ],
//           examples: [
//             "Daily writing practice",
//             "NaNoWriMo participation",
//             "Poetry slam performances",
//             "Publishing journey",
//           ],
//         },
//       },
//       {
//         title: "Visual Arts & Design",
//         description: {
//           overview:
//             "Explore painting, drawing, sculpture, and visual design while developing artistic vision and technical skill.",
//           vocabulary: [
//             "Composition",
//             "Color Theory",
//             "Perspective",
//             "Medium Exploration",
//             "Visual Language",
//             "Artistic Style",
//             "Design Principles",
//           ],
//           starters: [
//             "How did you develop your artistic style?",
//             "What draws you to your chosen medium?",
//             "How do you overcome creative blocks?",
//           ],
//           examples: [
//             "Daily sketching practice",
//             "Abstract expressionism",
//             "Digital illustration",
//             "Gallery exhibitions",
//           ],
//         },
//       },
//       {
//         title: "Music Creation & Theory",
//         description: {
//           overview:
//             "Compose, produce, and perform music while understanding theory, harmony, and the emotional power of sound.",
//           vocabulary: [
//             "Music Theory",
//             "Composition",
//             "Harmonic Progression",
//             "Production Techniques",
//             "Sound Design",
//             "Musical Arrangement",
//             "Instrumentation",
//           ],
//           starters: [
//             "How do you approach composing new music?",
//             "What instrument or production tool changed your music?",
//             "How do you capture emotion in your compositions?",
//           ],
//           examples: [
//             "Home studio production",
//             "Songwriting process",
//             "Learning music theory",
//             "Collaborative music making",
//           ],
//         },
//       },
//       {
//         title: "Performance & Theater Arts",
//         description: {
//           overview:
//             "Engage with live performance, theatrical storytelling, improvisation, and the vulnerability of stage presence.",
//           vocabulary: [
//             "Stage Presence",
//             "Character Work",
//             "Improvisation",
//             "Physical Theater",
//             "Performance Art",
//             "Audience Connection",
//             "Theatrical Technique",
//           ],
//           starters: [
//             "What draws you to live performance?",
//             "How do you prepare for being on stage?",
//             "What's your most memorable performance moment?",
//           ],
//           examples: [
//             "Method acting approaches",
//             "Improv comedy",
//             "One-person shows",
//             "Experimental theater",
//           ],
//         },
//       },
//       {
//         title: "Photography & Visual Storytelling",
//         description: {
//           overview:
//             "Capture moments, develop photographic eye, master technical skills, and tell stories through images.",
//           vocabulary: [
//             "Visual Narrative",
//             "Composition",
//             "Light Quality",
//             "Decisive Moment",
//             "Photo Essay",
//             "Post-Processing",
//             "Photographic Vision",
//           ],
//           starters: [
//             "How did you develop your photographic eye?",
//             "What story are you trying to tell through images?",
//             "Film or digital, and why?",
//           ],
//           examples: [
//             "Street photography projects",
//             "Portrait series",
//             "Documentary photography",
//             "Fine art photography",
//           ],
//         },
//       },
//       {
//         title: "Film & Video Production",
//         description: {
//           overview:
//             "Create moving images, understand cinematography, develop directorial vision, and craft video narratives.",
//           vocabulary: [
//             "Cinematography",
//             "Editing Rhythm",
//             "Visual Storytelling",
//             "Shot Composition",
//             "Color Grading",
//             "Directorial Vision",
//             "Production Design",
//           ],
//           starters: [
//             "What's your filmmaking process from concept to cut?",
//             "How do you approach visual storytelling?",
//             "What filmmakers influence your work?",
//           ],
//           examples: [
//             "Short film production",
//             "Documentary filmmaking",
//             "YouTube content creation",
//             "Music video direction",
//           ],
//         },
//       },
//       {
//         title: "Creative Process & Flow",
//         description: {
//           overview:
//             "Understand creativity, access flow states, overcome resistance, and build sustainable creative practices.",
//           vocabulary: [
//             "Flow State",
//             "Creative Blocks",
//             "Inspiration",
//             "Divergent Thinking",
//             "Creative Ritual",
//             "Artistic Practice",
//             "Innovation Process",
//           ],
//           starters: [
//             "How do you access creative flow?",
//             "What rituals support your creative work?",
//             "How do you work through resistance?",
//           ],
//           examples: [
//             "Morning pages practice",
//             "Artist dates and inspiration",
//             "Studio rituals",
//             "Collaboration dynamics",
//           ],
//         },
//       },
//     ],
//   },
//   {
//     title: "Professional Growth & Career",
//     subtopics: [
//       {
//         title: "Remote Work & Digital Nomadism",
//         description: {
//           overview:
//             "Navigate distributed work culture, build remote-first careers, and balance location independence with productivity.",
//           vocabulary: [
//             "Asynchronous Work",
//             "Remote Culture",
//             "Digital Nomad",
//             "Distributed Teams",
//             "Time Zone Management",
//             "Virtual Collaboration",
//             "Location Independence",
//           ],
//           starters: [
//             "How has remote work changed your career approach?",
//             "What tools enable your remote workflow?",
//             "How do you maintain work boundaries remotely?",
//           ],
//           examples: [
//             "Building remote-first companies",
//             "Working across continents",
//             "Digital nomad lifestyle",
//             "Hybrid team dynamics",
//           ],
//         },
//       },
//       {
//         title: "Career Pivots & Reinvention",
//         description: {
//           overview:
//             "Navigate major career transitions, identify transferable skills, and build new professional identities.",
//           vocabulary: [
//             "Career Transition",
//             "Skill Translation",
//             "Professional Reinvention",
//             "Portfolio Career",
//             "Upskilling",
//             "Career Pivot",
//             "Second Act",
//           ],
//           starters: [
//             "What triggered your career change?",
//             "How did you identify transferable skills?",
//             "What surprised you about switching careers?",
//           ],
//           examples: [
//             "Corporate to entrepreneurship",
//             "Industry switching at 40+",
//             "Multiple simultaneous careers",
//             "Sabbatical for reinvention",
//           ],
//         },
//       },
//       {
//         title: "Leadership Philosophy & Practice",
//         description: {
//           overview:
//             "Develop leadership identity, cultivate team culture, and navigate the complexity of guiding others.",
//           vocabulary: [
//             "Leadership Style",
//             "Team Dynamics",
//             "Servant Leadership",
//             "Psychological Safety",
//             "Feedback Culture",
//             "Transformational Leadership",
//             "Executive Presence",
//           ],
//           starters: [
//             "How has your leadership philosophy evolved?",
//             "What leadership challenges do you face?",
//             "How do you develop others as a leader?",
//           ],
//           examples: [
//             "Building high-trust teams",
//             "Navigating organizational change",
//             "Developing future leaders",
//             "Leading through crisis",
//           ],
//         },
//       },
//       {
//         title: "Personal Branding & Thought Leadership",
//         description: {
//           overview:
//             "Build professional reputation, share expertise publicly, and establish authority in your domain.",
//           vocabulary: [
//             "Thought Leadership",
//             "Personal Brand",
//             "Content Strategy",
//             "Network Effects",
//             "Professional Voice",
//             "Authority Building",
//             "Public Intellectual",
//           ],
//           starters: [
//             "How do you share your expertise publicly?",
//             "What's your content creation strategy?",
//             "How has personal branding affected your career?",
//           ],
//           examples: [
//             "LinkedIn thought leadership",
//             "Industry conference speaking",
//             "Newsletter building",
//             "Podcast hosting",
//           ],
//         },
//       },
//       {
//         title: "Negotiation & Career Advancement",
//         description: {
//           overview:
//             "Master salary negotiation, advocate for yourself, and strategically advance your career trajectory.",
//           vocabulary: [
//             "Salary Negotiation",
//             "Career Advocacy",
//             "Value Proposition",
//             "Career Capital",
//             "Strategic Advancement",
//             "Compensation Strategy",
//             "Professional Positioning",
//           ],
//           starters: [
//             "How do you approach salary negotiations?",
//             "What's your strategy for career advancement?",
//             "How do you advocate for yourself?",
//           ],
//           examples: [
//             "Negotiating remote work",
//             "Title and comp increases",
//             "Equity negotiations",
//             "Career leverage points",
//           ],
//         },
//       },
//       {
//         title: "Burnout & Sustainable Performance",
//         description: {
//           overview:
//             "Recognize burnout signs, build sustainable work practices, and maintain long-term professional wellbeing.",
//           vocabulary: [
//             "Burnout Prevention",
//             "Sustainable Performance",
//             "Energy Management",
//             "Professional Boundaries",
//             "Recovery Protocols",
//             "Work-Life Integration",
//             "Career Longevity",
//           ],
//           starters: [
//             "How do you prevent burnout?",
//             "What boundaries protect your wellbeing?",
//             "How did you recover from burnout?",
//           ],
//           examples: [
//             "Setting work boundaries",
//             "Sabbatical experiences",
//             "Energy management systems",
//             "Sustainable pace finding",
//           ],
//         },
//       },
//       {
//         title: "Entrepreneurship & Venture Building",
//         description: {
//           overview:
//             "Start and scale businesses, navigate startup challenges, and build ventures from ideas to sustainable companies.",
//           vocabulary: [
//             "Product-Market Fit",
//             "Founder Journey",
//             "Venture Building",
//             "Business Model",
//             "Startup Strategy",
//             "Fundraising",
//             "Scaling Challenges",
//           ],
//           starters: [
//             "What inspired you to start your venture?",
//             "How do you validate business ideas?",
//             "What's the hardest part of entrepreneurship?",
//           ],
//           examples: [
//             "Bootstrap to profitability",
//             "Fundraising journeys",
//             "Failed startup lessons",
//             "Building founding teams",
//           ],
//         },
//       },
//     ],
//   },
//   {
//     title: "Science & Natural World",
//     subtopics: [
//       {
//         title: "Climate Science & Environmental Action",
//         description: {
//           overview:
//             "Understand climate systems, engage with solutions, and take action on environmental challenges.",
//           vocabulary: [
//             "Carbon Budget",
//             "Climate Tipping Points",
//             "Renewable Transition",
//             "Climate Justice",
//             "Adaptation Strategies",
//             "Net Zero",
//             "Climate Solutions",
//           ],
//           starters: [
//             "What climate action are you taking personally?",
//             "How do you stay hopeful about climate change?",
//             "What climate solutions excite you most?",
//           ],
//           examples: [
//             "Personal carbon accounting",
//             "Community solar projects",
//             "Climate activism",
//             "Regenerative practices",
//           ],
//         },
//       },
//       {
//         title: "Ecology & Biodiversity",
//         description: {
//           overview:
//             "Explore ecosystem dynamics, species interdependence, and the intricate web of life on Earth.",
//           vocabulary: [
//             "Ecosystem Services",
//             "Keystone Species",
//             "Trophic Cascades",
//             "Biodiversity Hotspots",
//             "Ecological Succession",
//             "Habitat Fragmentation",
//             "Conservation Biology",
//           ],
//           starters: [
//             "What ecosystem fascinates you most?",
//             "How do you observe nature in your area?",
//             "What conservation efforts do you support?",
//           ],
//           examples: [
//             "Local ecosystem restoration",
//             "Wildlife corridor creation",
//             "Citizen science projects",
//             "Rewilding initiatives",
//           ],
//         },
//       },
//       {
//         title: "Cosmology & Universe Origins",
//         description: {
//           overview:
//             "Contemplate cosmic mysteries, understand universal origins, and explore humanity's place in existence.",
//           vocabulary: [
//             "Big Bang Theory",
//             "Dark Energy",
//             "Cosmic Inflation",
//             "Observable Universe",
//             "Multiverse Hypothesis",
//             "Cosmic Microwave Background",
//             "Spacetime",
//           ],
//           starters: [
//             "What cosmic mystery captivates you?",
//             "How does cosmology change your perspective?",
//             "What do you think about the multiverse?",
//           ],
//           examples: [
//             "Observing deep space objects",
//             "Understanding cosmic scales",
//             "Philosophical implications",
//             "Amateur astronomy",
//           ],
//         },
//       },
//       {
//         title: "Neuroscience & Consciousness",
//         description: {
//           overview:
//             "Explore brain function, consciousness mysteries, and the biological basis of subjective experience.",
//           vocabulary: [
//             "Neural Plasticity",
//             "Consciousness Studies",
//             "Neurotransmitters",
//             "Brain Mapping",
//             "Cognitive Neuroscience",
//             "Mind-Body Problem",
//             "Neural Networks",
//           ],
//           starters: [
//             "What neuroscience discoveries fascinate you?",
//             "How do you think consciousness emerges?",
//             "What's your take on the hard problem?",
//           ],
//           examples: [
//             "Neuroplasticity research",
//             "Psychedelic neuroscience",
//             "Memory formation",
//             "Brain-computer interfaces",
//           ],
//         },
//       },
//       {
//         title: "Ocean Systems & Marine Science",
//         description: {
//           overview:
//             "Dive into ocean dynamics, marine ecosystems, and the vital role of seas in planetary health.",
//           vocabulary: [
//             "Ocean Currents",
//             "Marine Ecosystems",
//             "Blue Carbon",
//             "Ocean Acidification",
//             "Deep Sea Biology",
//             "Coral Symbiosis",
//             "Oceanography",
//           ],
//           starters: [
//             "What ocean phenomena intrigues you?",
//             "How do you connect with marine environments?",
//             "What ocean conservation matters most?",
//           ],
//           examples: [
//             "Coral reef restoration",
//             "Deep sea exploration",
//             "Marine protected areas",
//             "Ocean cleanup efforts",
//           ],
//         },
//       },
//       {
//         title: "Evolutionary Biology & Origins",
//         description: {
//           overview:
//             "Trace life's history, understand evolutionary processes, and explore the mechanisms shaping biodiversity.",
//           vocabulary: [
//             "Natural Selection",
//             "Adaptive Radiation",
//             "Common Ancestry",
//             "Evolutionary Pressures",
//             "Genetic Drift",
//             "Speciation",
//             "Evolutionary Timeline",
//           ],
//           starters: [
//             "What evolutionary adaptations amaze you?",
//             "How does evolution shape your worldview?",
//             "What evolutionary mysteries remain?",
//           ],
//           examples: [
//             "Convergent evolution cases",
//             "Human evolution",
//             "Microevolution observations",
//             "Fossil record insights",
//           ],
//         },
//       },
//       {
//         title: "Mycology & Fungal Networks",
//         description: {
//           overview:
//             "Discover fungal kingdoms, understand mycelial networks, and explore fungi's crucial ecological roles.",
//           vocabulary: [
//             "Mycelial Networks",
//             "Symbiotic Relationships",
//             "Decomposition",
//             "Fungal Ecology",
//             "Wood Wide Web",
//             "Mycorrhizal Fungi",
//             "Fungal Intelligence",
//           ],
//           starters: [
//             "What draws you to mycology?",
//             "How have you observed fungal networks?",
//             "What role do fungi play in ecosystems?",
//           ],
//           examples: [
//             "Mushroom foraging",
//             "Mycelium cultivation",
//             "Fungal remediation",
//             "Underground networks",
//           ],
//         },
//       },
//     ],
//   },
//   {
//     title: "Lifelong Learning & Knowledge",
//     subtopics: [
//       {
//         title: "Self-Directed Learning & Autodidactism",
//         description: {
//           overview:
//             "Design personal curricula, master learning techniques, and take ownership of continuous education.",
//           vocabulary: [
//             "Autodidact",
//             "Learning Systems",
//             "Knowledge Management",
//             "Meta-Learning",
//             "Deliberate Practice",
//             "Spaced Repetition",
//             "Active Recall",
//           ],
//           starters: [
//             "How do you structure self-directed learning?",
//             "What learning techniques work best for you?",
//             "How do you maintain motivation without structure?",
//           ],
//           examples: [
//             "Personal learning projects",
//             "Building knowledge systems",
//             "Online course curation",
//             "Reading list management",
//           ],
//         },
//       },
//       {
//         title: "Language Acquisition & Polyglotism",
//         description: {
//           overview:
//             "Learn multiple languages, understand acquisition methods, and connect across linguistic boundaries.",
//           vocabulary: [
//             "Language Acquisition",
//             "Polyglot Methods",
//             "Immersion Learning",
//             "Language Interference",
//             "Fluency Levels",
//             "Comprehensible Input",
//             "Language Exchange",
//           ],
//           starters: [
//             "What's your language learning methodology?",
//             "How many languages are you working on?",
//             "What language learning breakthrough changed everything?",
//           ],
//           examples: [
//             "Comprehension-based methods",
//             "Speaking from day one",
//             "Language laddering",
//             "Maintaining multiple languages",
//           ],
//         },
//       },
//       {
//         title: "Educational Innovation & Pedagogy",
//         description: {
//           overview:
//             "Reimagine education systems, explore teaching methodologies, and understand how learning really works.",
//           vocabulary: [
//             "Pedagogical Approaches",
//             "Active Learning",
//             "Educational Design",
//             "Learning Science",
//             "Curriculum Development",
//             "Assessment Methods",
//             "Student-Centered Learning",
//           ],
//           starters: [
//             "How should education evolve?",
//             "What teaching approaches work best?",
//             "How do you learn most effectively?",
//           ],
//           examples: [
//             "Project-based learning",
//             "Socratic method",
//             "Peer learning models",
//             "Gamified education",
//           ],
//         },
//       },
//       {
//         title: "Digital Tools & Learning Technology",
//         description: {
//           overview:
//             "Leverage technology for learning, explore educational software, and optimize digital learning environments.",
//           vocabulary: [
//             "EdTech",
//             "Learning Platforms",
//             "AI-Assisted Learning",
//             "Adaptive Systems",
//             "Digital Literacy",
//             "Learning Analytics",
//             "Educational Software",
//           ],
//           starters: [
//             "What learning tools transformed your education?",
//             "How do you use AI for learning?",
//             "What's your digital learning stack?",
//           ],
//           examples: [
//             "Anki for spaced repetition",
//             "Online course platforms",
//             "AI tutoring systems",
//             "Knowledge management apps",
//           ],
//         },
//       },
//       {
//         title: "Research Methods & Academic Inquiry",
//         description: {
//           overview:
//             "Conduct rigorous research, understand methodologies, and contribute to knowledge creation.",
//           vocabulary: [
//             "Research Design",
//             "Methodology",
//             "Empirical Evidence",
//             "Literature Review",
//             "Academic Rigor",
//             "Peer Review",
//             "Research Ethics",
//           ],
//           starters: [
//             "What research projects are you pursuing?",
//             "How do you approach research questions?",
//             "What makes research meaningful to you?",
//           ],
//           examples: [
//             "Independent research projects",
//             "Academic publishing",
//             "Citizen science",
//             "Collaborative research",
//           ],
//         },
//       },
//       {
//         title: "Critical Thinking & Reasoning",
//         description: {
//           overview:
//             "Develop analytical skills, recognize logical fallacies, and improve decision-making through clearer thinking.",
//           vocabulary: [
//             "Logical Reasoning",
//             "Critical Analysis",
//             "Cognitive Biases",
//             "Argument Structure",
//             "Epistemic Humility",
//             "Evidence Evaluation",
//             "Rational Thinking",
//           ],
//           starters: [
//             "How do you strengthen critical thinking?",
//             "What cognitive biases do you watch for?",
//             "How has your reasoning evolved?",
//           ],
//           examples: [
//             "Analyzing arguments",
//             "Bias recognition",
//             "Evidence weighing",
//             "Intellectual humility",
//           ],
//         },
//       },
//       {
//         title: "Interdisciplinary Thinking",
//         description: {
//           overview:
//             "Connect ideas across domains, synthesize knowledge, and develop integrative understanding.",
//           vocabulary: [
//             "Interdisciplinary",
//             "Knowledge Synthesis",
//             "Cross-Domain Thinking",
//             "Integrative Learning",
//             "Mental Models",
//             "Conceptual Bridges",
//             "Polymathy",
//           ],
//           starters: [
//             "How do you connect different fields?",
//             "What unexpected connections have you found?",
//             "How does broad knowledge inform depth?",
//           ],
//           examples: [
//             "Applying physics to social science",
//             "Biology-technology intersections",
//             "Art-science collaborations",
//             "Systems thinking",
//           ],
//         },
//       },
//     ],
//   },
//   {
//     title: "Philosophy & Human Nature",
//     subtopics: [
//       {
//         title: "Ethics & Moral Philosophy",
//         description: {
//           overview:
//             "Examine ethical frameworks, navigate moral complexity, and develop personal ethical philosophy.",
//           vocabulary: [
//             "Moral Philosophy",
//             "Ethical Frameworks",
//             "Virtue Ethics",
//             "Consequentialism",
//             "Deontology",
//             "Moral Reasoning",
//             "Applied Ethics",
//           ],
//           starters: [
//             "What ethical framework guides your decisions?",
//             "How do you navigate moral dilemmas?",
//             "What's your take on moral relativism?",
//           ],
//           examples: [
//             "Trolley problem variations",
//             "Professional ethics",
//             "Environmental ethics",
//             "AI ethics challenges",
//           ],
//         },
//       },
//       {
//         title: "Consciousness & Mind",
//         description: {
//           overview:
//             "Explore subjective experience, question consciousness nature, and investigate mind-body relationships.",
//           vocabulary: [
//             "Phenomenology",
//             "Qualia",
//             "Hard Problem",
//             "Subjective Experience",
//             "Mind-Body Dualism",
//             "Consciousness Studies",
//             "Self-Awareness",
//           ],
//           starters: [
//             "What is consciousness to you?",
//             "How do you experience your own awareness?",
//             "What's your view on the hard problem?",
//           ],
//           examples: [
//             "Meditation and consciousness",
//             "Altered states exploration",
//             "Philosophical zombies",
//             "Panpsychism debates",
//           ],
//         },
//       },
//       {
//         title: "Existentialism & Meaning",
//         description: {
//           overview:
//             "Confront existence, create meaning, and navigate freedom, responsibility, and authenticity.",
//           vocabulary: [
//             "Existentialism",
//             "Authenticity",
//             "Absurdism",
//             "Existential Freedom",
//             "Bad Faith",
//             "Meaning-Making",
//             "Life Purpose",
//           ],
//           starters: [
//             "How do you create meaning in life?",
//             "What does living authentically mean to you?",
//             "How do you confront existential questions?",
//           ],
//           examples: [
//             "Finding purpose",
//             "Living with absurdity",
//             "Authentic choices",
//             "Existential anxiety",
//           ],
//         },
//       },
//       {
//         title: "Epistemology & Knowledge",
//         description: {
//           overview:
//             "Question how we know, examine truth claims, and understand the foundations of knowledge itself.",
//           vocabulary: [
//             "Epistemology",
//             "Justified Belief",
//             "Skepticism",
//             "Truth Theories",
//             "Knowledge Acquisition",
//             "Epistemic Justification",
//             "Certainty",
//           ],
//           starters: [
//             "How do you know what you know?",
//             "What's your approach to truth?",
//             "How do you handle uncertainty?",
//           ],
//           examples: [
//             "Scientific knowledge",
//             "Skeptical inquiry",
//             "Belief justification",
//             "Knowledge limits",
//           ],
//         },
//       },
//       {
//         title: "Social & Political Philosophy",
//         description: {
//           overview:
//             "Examine social structures, political systems, justice theories, and visions of good society.",
//           vocabulary: [
//             "Political Theory",
//             "Social Justice",
//             "Social Contract",
//             "Distributive Justice",
//             "Liberty vs Equality",
//             "Democratic Theory",
//             "Political Philosophy",
//           ],
//           starters: [
//             "What constitutes a just society?",
//             "How do you balance freedom and equality?",
//             "What's your political philosophy?",
//           ],
//           examples: [
//             "Justice theories",
//             "Rights frameworks",
//             "Democratic participation",
//             "Social systems design",
//           ],
//         },
//       },
//       {
//         title: "Cognitive Psychology & Biases",
//         description: {
//           overview:
//             "Understand mental processes, recognize cognitive limitations, and improve thinking through awareness.",
//           vocabulary: [
//             "Cognitive Biases",
//             "Heuristics",
//             "Decision-Making",
//             "Mental Models",
//             "Rationality",
//             "Cognitive Science",
//             "Thinking Errors",
//           ],
//           starters: [
//             "What biases do you actively work against?",
//             "How do you improve your thinking?",
//             "What mental models guide you?",
//           ],
//           examples: [
//             "Confirmation bias awareness",
//             "Decision frameworks",
//             "Rationality techniques",
//             "Cognitive debiasing",
//           ],
//         },
//       },
//       {
//         title: "Behavioral & Social Psychology",
//         description: {
//           overview:
//             "Examine human behavior in social contexts, understand group dynamics, and explore interpersonal influence.",
//           vocabulary: [
//             "Social Psychology",
//             "Group Dynamics",
//             "Social Influence",
//             "Behavioral Economics",
//             "Conformity",
//             "Social Identity",
//             "Interpersonal Behavior",
//           ],
//           starters: [
//             "How do groups influence individual behavior?",
//             "What social psychology findings surprise you?",
//             "How do you resist social pressure?",
//           ],
//           examples: [
//             "Bystander effect",
//             "Authority obedience",
//             "Social conformity",
//             "In-group bias",
//           ],
//         },
//       },
//     ],
//   },
//   {
//     title: "Crafts & Collections",
//     subtopics: [
//       {
//         title: "Photography & Visual Arts",
//         description: {
//           overview:
//             "Develop photographic vision, master technique, and tell stories through captured light and moment.",
//           vocabulary: [
//             "Composition",
//             "Light Quality",
//             "Exposure Triangle",
//             "Visual Storytelling",
//             "Photographic Style",
//             "Post-Processing",
//             "Decisive Moment",
//           ],
//           starters: [
//             "What photographic style are you developing?",
//             "How do you see light differently now?",
//             "What's your approach to photo editing?",
//           ],
//           examples: [
//             "Street photography",
//             "Portrait lighting",
//             "Landscape photography",
//             "Documentary projects",
//           ],
//         },
//       },
//       {
//         title: "Horticulture & Plant Cultivation",
//         description: {
//           overview:
//             "Grow plants, understand ecosystems, and connect with nature through cultivation and stewardship.",
//           vocabulary: [
//             "Plant Propagation",
//             "Soil Biology",
//             "Companion Planting",
//             "Permaculture",
//             "Native Plants",
//             "Garden Ecology",
//             "Horticultural Practices",
//           ],
//           starters: [
//             "What's your gardening philosophy?",
//             "How has gardening changed your perspective?",
//             "What are you experimenting with growing?",
//           ],
//           examples: [
//             "Food forest design",
//             "Native plant gardens",
//             "Indoor plant care",
//             "Seed saving",
//           ],
//         },
//       },
//       {
//         title: "Curating & Collecting",
//         description: {
//           overview:
//             "Build meaningful collections, develop connoisseurship, and preserve objects of cultural or personal significance.",
//           vocabulary: [
//             "Curation",
//             "Provenance",
//             "Authentication",
//             "Collection Strategy",
//             "Archival Preservation",
//             "Connoisseurship",
//             "Collection Management",
//           ],
//           starters: [
//             "What drives your collecting passion?",
//             "How do you curate your collection?",
//             "What's the story behind your favorite piece?",
//           ],
//           examples: [
//             "Vinyl record collecting",
//             "First edition books",
//             "Vintage cameras",
//             "Art collecting",
//           ],
//         },
//       },
//       {
//         title: "Woodworking & Craftsmanship",
//         description: {
//           overview:
//             "Work with wood, develop hand skills, and create functional art through traditional and modern techniques.",
//           vocabulary: [
//             "Joinery",
//             "Wood Grain",
//             "Craftsmanship",
//             "Hand Tools",
//             "Finishing Techniques",
//             "Woodworking Design",
//             "Traditional Methods",
//           ],
//           starters: [
//             "What drew you to woodworking?",
//             "What project taught you the most?",
//             "Hand tools or power tools?",
//           ],
//           examples: [
//             "Furniture making",
//             "Wood turning",
//             "Carving projects",
//             "Restoration work",
//           ],
//         },
//       },
//       {
//         title: "Textile Arts & Fiber Crafts",
//         description: {
//           overview:
//             "Work with textiles, master fiber techniques, and create through weaving, knitting, or fabric manipulation.",
//           vocabulary: [
//             "Fiber Arts",
//             "Textile Design",
//             "Weaving Patterns",
//             "Knitting Techniques",
//             "Natural Dyes",
//             "Fabric Manipulation",
//             "Handcrafted Textiles",
//           ],
//           starters: [
//             "What textile techniques are you learning?",
//             "How do you source materials?",
//             "What's your current fiber project?",
//           ],
//           examples: [
//             "Weaving on looms",
//             "Knitting complex patterns",
//             "Natural dyeing",
//             "Quilting traditions",
//           ],
//         },
//       },
//       {
//         title: "Strategy Gaming & Puzzles",
//         description: {
//           overview:
//             "Engage with strategic thinking, solve complex puzzles, and explore game theory through play.",
//           vocabulary: [
//             "Game Theory",
//             "Strategic Thinking",
//             "Problem Solving",
//             "Puzzle Logic",
//             "Game Mechanics",
//             "Decision Trees",
//             "Pattern Recognition",
//           ],
//           starters: [
//             "What games challenge you most?",
//             "How has gaming improved your thinking?",
//             "What's your puzzle-solving approach?",
//           ],
//           examples: [
//             "Chess strategy",
//             "Complex board games",
//             "Escape room design",
//             "Mathematical puzzles",
//           ],
//         },
//       },
//       {
//         title: "Analog & Film Photography",
//         description: {
//           overview:
//             "Work with film, understand chemical processes, and embrace photography's analog roots and aesthetics.",
//           vocabulary: [
//             "Film Photography",
//             "Darkroom Process",
//             "Film Development",
//             "Analog Aesthetic",
//             "Chemical Processing",
//             "Film Formats",
//             "Enlargement",
//           ],
//           starters: [
//             "What drew you back to film?",
//             "Do you develop your own film?",
//             "What film stocks do you prefer?",
//           ],
//           examples: [
//             "Black and white darkroom",
//             "Large format photography",
//             "Film scanning techniques",
//             "Alternative processes",
//           ],
//         },
//       },
//     ],
//   },
//   {
//     title: "Media & Digital Culture",
//     subtopics: [
//       {
//         title: "Podcasting & Audio Storytelling",
//         description: {
//           overview:
//             "Create podcasts, master audio narrative, and explore the intimate medium of voice and sound.",
//           vocabulary: [
//             "Audio Production",
//             "Narrative Structure",
//             "Interview Techniques",
//             "Sound Design",
//             "Podcasting",
//             "Audio Editing",
//             "Sonic Storytelling",
//           ],
//           starters: [
//             "What podcasts have influenced you?",
//             "What's your podcast creation process?",
//             "How do you craft audio narratives?",
//           ],
//           examples: [
//             "Interview podcasting",
//             "True crime narratives",
//             "Educational podcasts",
//             "Fiction podcasts",
//           ],
//         },
//       },
//       {
//         title: "Digital Communities & Online Culture",
//         description: {
//           overview:
//             "Navigate online spaces, build digital communities, and understand internet culture's evolution.",
//           vocabulary: [
//             "Online Communities",
//             "Digital Culture",
//             "Community Management",
//             "Platform Dynamics",
//             "Virtual Spaces",
//             "Internet Culture",
//             "Community Building",
//           ],
//           starters: [
//             "What online communities are meaningful to you?",
//             "How has internet culture evolved?",
//             "What makes digital communities thrive?",
//           ],
//           examples: [
//             "Discord communities",
//             "Reddit subcultures",
//             "Gaming communities",
//             "Learning communities",
//           ],
//         },
//       },
//       {
//         title: "Comics & Graphic Narratives",
//         description: {
//           overview:
//             "Explore sequential art, understand visual storytelling, and appreciate the graphic novel medium.",
//           vocabulary: [
//             "Sequential Art",
//             "Panel Composition",
//             "Visual Narrative",
//             "Graphic Novel",
//             "Comics Medium",
//             "Illustration Style",
//             "Visual Language",
//           ],
//           starters: [
//             "What graphic novels have impacted you?",
//             "How does visual storytelling work differently?",
//             "What artists inspire your work?",
//           ],
//           examples: [
//             "Independent comics",
//             "Webcomics creation",
//             "Manga appreciation",
//             "Graphic memoirs",
//           ],
//         },
//       },
//       {
//         title: "Internet Humor & Meme Culture",
//         description: {
//           overview:
//             "Understand digital humor evolution, create and share memes, and explore online comedy's language.",
//           vocabulary: [
//             "Meme Culture",
//             "Internet Humor",
//             "Viral Content",
//             "Digital Comedy",
//             "Online Satire",
//             "Meta-Humor",
//             "Platform Humor",
//           ],
//           starters: [
//             "How has internet humor evolved?",
//             "What meme culture resonates with you?",
//             "What makes memes effective communication?",
//           ],
//           examples: [
//             "Meme creation",
//             "Platform-specific humor",
//             "Nostalgic internet",
//             "Comedy communities",
//           ],
//         },
//       },
//       {
//         title: "Content Creation & Digital Media",
//         description: {
//           overview:
//             "Produce digital content, build audiences, and navigate creator economy platforms and strategies.",
//           vocabulary: [
//             "Content Strategy",
//             "Creator Economy",
//             "Audience Building",
//             "Platform Algorithms",
//             "Digital Publishing",
//             "Content Marketing",
//             "Media Production",
//           ],
//           starters: [
//             "What's your content creation philosophy?",
//             "How do you grow an audience authentically?",
//             "What platform works best for you?",
//           ],
//           examples: [
//             "YouTube channels",
//             "Newsletter building",
//             "TikTok creation",
//             "Blog writing",
//           ],
//         },
//       },
//       {
//         title: "Streaming & Gaming Culture",
//         description: {
//           overview:
//             "Engage with gaming communities, understand streaming culture, and explore interactive entertainment.",
//           vocabulary: [
//             "Gaming Culture",
//             "Live Streaming",
//             "Esports",
//             "Gaming Communities",
//             "Interactive Entertainment",
//             "Streaming Platforms",
//             "Game Studies",
//           ],
//           starters: [
//             "What games are you currently playing?",
//             "How has gaming culture changed?",
//             "What's your take on streaming as entertainment?",
//           ],
//           examples: [
//             "Competitive gaming",
//             "Streaming communities",
//             "Indie games",
//             "Game analysis",
//           ],
//         },
//       },
//       {
//         title: "Digital Minimalism & Tech Intentionality",
//         description: {
//           overview:
//             "Use technology intentionally, resist attention economy, and cultivate mindful digital habits.",
//           vocabulary: [
//             "Digital Minimalism",
//             "Attention Economy",
//             "Tech Intentionality",
//             "Digital Detox",
//             "Mindful Technology",
//             "Focus Management",
//             "Digital Wellbeing",
//           ],
//           starters: [
//             "How do you manage technology use?",
//             "What digital boundaries do you set?",
//             "How has digital minimalism affected you?",
//           ],
//           examples: [
//             "App usage limiting",
//             "Social media breaks",
//             "Notification management",
//             "Analog alternatives",
//           ],
//         },
//       },
//     ],
//   },
//   {
//     title: "Living Spaces & Design",
//     subtopics: [
//       {
//         title: "Interior Architecture & Design",
//         description: {
//           overview:
//             "Design living spaces, understand spatial relationships, and create environments that support wellbeing.",
//           vocabulary: [
//             "Spatial Design",
//             "Interior Architecture",
//             "Flow",
//             "Design Principles",
//             "Space Planning",
//             "Aesthetic Cohesion",
//             "Functional Design",
//           ],
//           starters: [
//             "How do you approach space design?",
//             "What design principles guide you?",
//             "How does your space affect wellbeing?",
//           ],
//           examples: [
//             "Open concept living",
//             "Biophilic design",
//             "Minimalist spaces",
//             "Adaptive reuse",
//           ],
//         },
//       },
//       {
//         title: "Minimalism & Intentional Living",
//         description: {
//           overview:
//             "Simplify possessions, live intentionally, and focus on what truly matters through conscious consumption.",
//           vocabulary: [
//             "Minimalism",
//             "Intentional Living",
//             "Essentialism",
//             "Conscious Consumption",
//             "Life Simplification",
//             "Value Alignment",
//             "Mindful Ownership",
//           ],
//           starters: [
//             "What led you to minimalism?",
//             "How do you decide what to keep?",
//             "What has simplifying changed for you?",
//           ],
//           examples: [
//             "Capsule wardrobes",
//             "Digital minimalism",
//             "One-in-one-out rules",
//             "Experience over possessions",
//           ],
//         },
//       },
//       {
//         title: "Smart Home & Automation",
//         description: {
//           overview:
//             "Automate home systems, integrate technology thoughtfully, and create responsive living environments.",
//           vocabulary: [
//             "Home Automation",
//             "Smart Systems",
//             "IoT Integration",
//             "Automated Routines",
//             "Connected Living",
//             "Home Intelligence",
//             "Energy Management",
//           ],
//           starters: [
//             "What's your smart home philosophy?",
//             "Which automations improve your life?",
//             "How do you balance tech and simplicity?",
//           ],
//           examples: [
//             "Lighting automation",
//             "Climate control",
//             "Security systems",
//             "Energy monitoring",
//           ],
//         },
//       },
//       {
//         title: "Sustainable Home Practices",
//         description: {
//           overview:
//             "Reduce environmental impact, adopt eco-friendly practices, and create regenerative home systems.",
//           vocabulary: [
//             "Home Sustainability",
//             "Waste Reduction",
//             "Energy Efficiency",
//             "Eco-Friendly Living",
//             "Green Building",
//             "Resource Conservation",
//             "Circular Economy",
//           ],
//           starters: [
//             "What sustainable practices have you adopted?",
//             "How do you reduce waste at home?",
//             "What eco-upgrades have you made?",
//           ],
//           examples: [
//             "Composting systems",
//             "Solar installation",
//             "Water conservation",
//             "Sustainable materials",
//           ],
//         },
//       },
//       {
//         title: "Urban vs Rural Living",
//         description: {
//           overview:
//             "Compare lifestyle choices, understand tradeoffs, and explore different living environments' unique qualities.",
//           vocabulary: [
//             "Urban Living",
//             "Rural Lifestyle",
//             "Suburban Life",
//             "Community Dynamics",
//             "Lifestyle Tradeoffs",
//             "Place-Making",
//             "Environmental Context",
//           ],
//           starters: [
//             "What draws you to your living environment?",
//             "What tradeoffs do you accept?",
//             "How does location shape daily life?",
//           ],
//           examples: [
//             "City walkability",
//             "Rural land stewardship",
//             "Suburban community",
//             "Small town life",
//           ],
//         },
//       },
//       {
//         title: "DIY Home Improvement",
//         description: {
//           overview:
//             "Renovate spaces, learn building skills, and transform homes through hands-on work.",
//           vocabulary: [
//             "Home Renovation",
//             "DIY Projects",
//             "Building Skills",
//             "Home Improvement",
//             "Construction Basics",
//             "Property Enhancement",
//             "Restoration",
//           ],
//           starters: [
//             "What home projects are you tackling?",
//             "What renovation taught you most?",
//             "DIY or hire professionals?",
//           ],
//           examples: [
//             "Kitchen remodels",
//             "Bathroom renovations",
//             "Outdoor spaces",
//             "Historic restoration",
//           ],
//         },
//       },
//       {
//         title: "Cohousing & Community Living",
//         description: {
//           overview:
//             "Explore intentional communities, shared living models, and alternative housing approaches.",
//           vocabulary: [
//             "Cohousing",
//             "Intentional Community",
//             "Cooperative Living",
//             "Shared Resources",
//             "Community Design",
//             "Collaborative Living",
//             "Housing Alternatives",
//           ],
//           starters: [
//             "What draws you to community living?",
//             "How do shared spaces work?",
//             "What challenges arise in cohousing?",
//           ],
//           examples: [
//             "Cohousing communities",
//             "Co-ops",
//             "Eco-villages",
//             "Multigenerational living",
//           ],
//         },
//       },
//     ],
//   },
//   {
//     title: "Family & Relationships",
//     subtopics: [
//       {
//         title: "Conscious Parenting & Child Development",
//         description: {
//           overview:
//             "Raise children mindfully, understand developmental stages, and foster emotional intelligence.",
//           vocabulary: [
//             "Conscious Parenting",
//             "Child Development",
//             "Attachment Theory",
//             "Emotional Intelligence",
//             "Positive Discipline",
//             "Developmental Milestones",
//             "Parenting Philosophy",
//           ],
//           starters: [
//             "What's your parenting philosophy?",
//             "How do you support emotional development?",
//             "What parenting approach resonates with you?",
//           ],
//           examples: [
//             "Attachment parenting",
//             "Respectful parenting",
//             "Montessori at home",
//             "Emotional coaching",
//           ],
//         },
//       },
//       {
//         title: "Work-Life Integration with Family",
//         description: {
//           overview:
//             "Balance career and family, integrate rather than separate, and navigate modern parenthood.",
//           vocabulary: [
//             "Work-Life Integration",
//             "Parental Balance",
//             "Family Priorities",
//             "Time Management",
//             "Present Parenting",
//             "Career Flexibility",
//             "Family Systems",
//           ],
//           starters: [
//             "How do you integrate work and family?",
//             "What boundaries protect family time?",
//             "How has parenthood changed your career?",
//           ],
//           examples: [
//             "Flexible work arrangements",
//             "Family routines",
//             "Quality time practices",
//             "Career adaptations",
//           ],
//         },
//       },
//       {
//         title: "Creating Family Culture & Traditions",
//         description: {
//           overview:
//             "Build family identity, establish meaningful traditions, and create lasting memories together.",
//           vocabulary: [
//             "Family Culture",
//             "Traditions",
//             "Rituals",
//             "Shared Values",
//             "Family Identity",
//             "Memory Making",
//             "Legacy Building",
//           ],
//           starters: [
//             "What family traditions mean most to you?",
//             "How do you create family culture?",
//             "What values guide your family?",
//           ],
//           examples: [
//             "Weekly family dinners",
//             "Annual traditions",
//             "Storytelling practices",
//             "Adventure traditions",
//           ],
//         },
//       },
//       {
//         title: "Multigenerational Relationships",
//         description: {
//           overview:
//             "Navigate extended family, honor generational wisdom, and bridge age differences.",
//           vocabulary: [
//             "Extended Family",
//             "Generational Wisdom",
//             "Family Dynamics",
//             "Intergenerational Learning",
//             "Elder Care",
//             "Family Bonds",
//             "Generational Bridge",
//           ],
//           starters: [
//             "How do generations connect in your family?",
//             "What wisdom has been passed down?",
//             "How do you navigate family differences?",
//           ],
//           examples: [
//             "Grandparent relationships",
//             "Elder caregiving",
//             "Family storytelling",
//             "Bridging generations",
//           ],
//         },
//       },
//       {
//         title: "Alternative Education Paths",
//         description: {
//           overview:
//             "Explore homeschooling, unschooling, and non-traditional education for children.",
//           vocabulary: [
//             "Homeschooling",
//             "Unschooling",
//             "Alternative Education",
//             "Self-Directed Learning",
//             "Educational Freedom",
//             "Learning Philosophy",
//             "Child-Led Education",
//           ],
//           starters: [
//             "What led you to alternative education?",
//             "How do you approach learning at home?",
//             "What's your educational philosophy?",
//           ],
//           examples: [
//             "Unschooling journeys",
//             "Homeschool co-ops",
//             "Democratic schools",
//             "Forest schools",
//           ],
//         },
//       },
//       {
//         title: "Relationship Communication & Growth",
//         description: {
//           overview:
//             "Deepen partnerships, improve communication, and navigate relationship evolution.",
//           vocabulary: [
//             "Relationship Communication",
//             "Partnership Growth",
//             "Conflict Resolution",
//             "Emotional Intimacy",
//             "Relationship Skills",
//             "Connection Practices",
//             "Conscious Partnership",
//           ],
//           starters: [
//             "How has your relationship evolved?",
//             "What communication practices work for you?",
//             "How do you navigate conflict?",
//           ],
//           examples: [
//             "Active listening",
//             "Relationship rituals",
//             "Growth through challenges",
//             "Maintaining connection",
//           ],
//         },
//       },
//       {
//         title: "Single Parenthood & Solo Families",
//         description: {
//           overview:
//             "Navigate single parenting, build support systems, and thrive as a solo parent family.",
//           vocabulary: [
//             "Single Parenting",
//             "Solo Parent",
//             "Support Systems",
//             "Family Structure",
//             "Resilience",
//             "Community Building",
//             "Self-Care",
//           ],
//           starters: [
//             "What's your single parenting experience?",
//             "How do you build support systems?",
//             "What strengths has solo parenting developed?",
//           ],
//           examples: [
//             "Co-parenting arrangements",
//             "Building village",
//             "Time management",
//             "Thriving solo",
//           ],
//         },
//       },
//     ],
//   },
//   {
//     title: "Outdoor & Athletic Pursuits",
//     subtopics: [
//       {
//         title: "Endurance Sports & Training",
//         description: {
//           overview:
//             "Push physical limits, train for endurance events, and explore what the body can achieve.",
//           vocabulary: [
//             "Endurance Training",
//             "Periodization",
//             "Aerobic Capacity",
//             "Training Zones",
//             "Athletic Performance",
//             "Race Strategy",
//             "Recovery Protocols",
//           ],
//           starters: [
//             "What endurance events are you training for?",
//             "How has endurance training changed you?",
//             "What's your training philosophy?",
//           ],
//           examples: [
//             "Marathon training",
//             "Ultrarunning",
//             "Ironman preparation",
//             "Cycling centuries",
//           ],
//         },
//       },
//       {
//         title: "Backcountry & Wilderness Skills",
//         description: {
//           overview:
//             "Develop wilderness competency, practice Leave No Trace, and safely explore remote areas.",
//           vocabulary: [
//             "Wilderness Skills",
//             "Backcountry Navigation",
//             "Leave No Trace",
//             "Self-Sufficiency",
//             "Risk Management",
//             "Outdoor Ethics",
//             "Wilderness Medicine",
//           ],
//           starters: [
//             "What wilderness skills have you developed?",
//             "How do you prepare for backcountry trips?",
//             "What wild places call to you?",
//           ],
//           examples: [
//             "Backpacking trips",
//             "Wilderness navigation",
//             "Survival skills",
//             "Remote expeditions",
//           ],
//         },
//       },
//       {
//         title: "Water Sports & Aquatic Activities",
//         description: {
//           overview:
//             "Master water-based activities, from surfing to sailing, and connect with aquatic environments.",
//           vocabulary: [
//             "Water Sports",
//             "Ocean Literacy",
//             "Aquatic Skills",
//             "Wave Dynamics",
//             "Marine Safety",
//             "Water Confidence",
//             "Aquatic Environment",
//           ],
//           starters: [
//             "How did you learn your water sport?",
//             "What draws you to water activities?",
//             "What's your relationship with the ocean?",
//           ],
//           examples: [
//             "Surfing progression",
//             "Kayaking expeditions",
//             "Open water swimming",
//             "Sailing adventures",
//           ],
//         },
//       },
//       {
//         title: "Mountain Sports & Alpine Pursuits",
//         description: {
//           overview:
//             "Climb mountains, ski backcountry, and engage with high-altitude environments.",
//           vocabulary: [
//             "Mountaineering",
//             "Alpine Skills",
//             "Altitude Adaptation",
//             "Snow Safety",
//             "Technical Climbing",
//             "Mountain Environment",
//             "Risk Assessment",
//           ],
//           starters: [
//             "What mountain experiences shaped you?",
//             "How do you prepare for altitude?",
//             "What peaks are on your list?",
//           ],
//           examples: [
//             "Alpine climbing",
//             "Backcountry skiing",
//             "Ice climbing",
//             "High altitude trekking",
//           ],
//         },
//       },
//       {
//         title: "Cycling & Bikepacking",
//         description: {
//           overview:
//             "Explore by bike, from road cycling to bikepacking adventures, and embrace bicycle culture.",
//           vocabulary: [
//             "Cycling",
//             "Bikepacking",
//             "Bike Touring",
//             "Cycling Culture",
//             "Self-Supported Travel",
//             "Bike Mechanics",
//             "Route Planning",
//           ],
//           starters: [
//             "What cycling adventures have you taken?",
//             "How has cycling changed your perspective?",
//             "What's your dream bike route?",
//           ],
//           examples: [
//             "Bikepacking trips",
//             "Cycle touring",
//             "Gravel riding",
//             "Urban cycling",
//           ],
//         },
//       },
//       {
//         title: "Rock Climbing & Bouldering",
//         description: {
//           overview:
//             "Climb rocks, solve movement puzzles, and develop strength and mental focus through climbing.",
//           vocabulary: [
//             "Climbing Technique",
//             "Route Reading",
//             "Bouldering",
//             "Rope Systems",
//             "Movement Efficiency",
//             "Mental Focus",
//             "Climbing Training",
//           ],
//           starters: [
//             "How did you get into climbing?",
//             "What style of climbing suits you?",
//             "How has climbing changed you?",
//           ],
//           examples: [
//             "Sport climbing",
//             "Trad climbing",
//             "Bouldering projects",
//             "Competition climbing",
//           ],
//         },
//       },
//       {
//         title: "Trail Running & Mountain Running",
//         description: {
//           overview:
//             "Run trails, navigate terrain, and experience landscapes through movement.",
//           vocabulary: [
//             "Trail Running",
//             "Vertical Gain",
//             "Technical Terrain",
//             "Mountain Running",
//             "Ultrarunning",
//             "Trail Culture",
//             "Adaptive Pacing",
//           ],
//           starters: [
//             "What trails are you exploring?",
//             "How is trail running different for you?",
//             "What ultra distance calls to you?",
//           ],
//           examples: [
//             "Mountain ultramarathons",
//             "Technical trail races",
//             "Alpine running",
//             "Trail FKTs",
//           ],
//         },
//       },
//     ],
//   },
//   {
//     title: "Finance & Economics",
//     subtopics: [
//       {
//         title: "Personal Finance & Wealth Building",
//         description: {
//           overview:
//             "Master money management, build wealth systematically, and achieve financial independence.",
//           vocabulary: [
//             "Financial Independence",
//             "Wealth Building",
//             "Asset Allocation",
//             "Passive Income",
//             "Investment Strategy",
//             "Financial Literacy",
//             "Net Worth Growth",
//           ],
//           starters: [
//             "What's your approach to wealth building?",
//             "How did you develop financial literacy?",
//             "What financial goals are you working toward?",
//           ],
//           examples: [
//             "Index fund investing",
//             "Real estate investing",
//             "Dividend portfolios",
//             "Side income streams",
//           ],
//         },
//       },
//       {
//         title: "Financial Independence & Early Retirement",
//         description: {
//           overview:
//             "Pursue FIRE principles, optimize savings rates, and design financially independent lifestyles.",
//           vocabulary: [
//             "FIRE Movement",
//             "Savings Rate",
//             "Financial Freedom",
//             "Early Retirement",
//             "Geographic Arbitrage",
//             "Lifestyle Design",
//             "Financial Optimization",
//           ],
//           starters: [
//             "What's your FIRE strategy?",
//             "How do you optimize your savings rate?",
//             "What does financial independence mean to you?",
//           ],
//           examples: [
//             "Coast FIRE",
//             "Barista FIRE",
//             "Lean FIRE lifestyle",
//             "Geographic arbitrage",
//           ],
//         },
//       },
//       {
//         title: "Investing & Market Analysis",
//         description: {
//           overview:
//             "Analyze markets, develop investment theses, and build diversified portfolios.",
//           vocabulary: [
//             "Investment Analysis",
//             "Portfolio Theory",
//             "Market Dynamics",
//             "Asset Classes",
//             "Risk Management",
//             "Due Diligence",
//             "Market Psychology",
//           ],
//           starters: [
//             "What's your investment philosophy?",
//             "How do you analyze opportunities?",
//             "What investing mistakes taught you?",
//           ],
//           examples: [
//             "Value investing",
//             "Growth investing",
//             "Sector rotation",
//             "Alternative investments",
//           ],
//         },
//       },
//       {
//         title: "Entrepreneurial Finance & Business",
//         description: {
//           overview:
//             "Understand business finance, manage cash flow, and build profitable ventures.",
//           vocabulary: [
//             "Business Finance",
//             "Cash Flow Management",
//             "Unit Economics",
//             "Business Valuation",
//             "Financial Modeling",
//             "Capital Structure",
//             "Profitability",
//           ],
//           starters: [
//             "How do you manage business finances?",
//             "What financial metrics matter most?",
//             "How do you think about profitability?",
//           ],
//           examples: [
//             "Bootstrap strategies",
//             "Financial planning",
//             "Pricing strategies",
//             "Growth financing",
//           ],
//         },
//       },
//       {
//         title: "Economic Systems & Theory",
//         description: {
//           overview:
//             "Understand economic principles, analyze systems, and explore economic philosophies.",
//           vocabulary: [
//             "Economic Theory",
//             "Market Mechanisms",
//             "Economic Systems",
//             "Macroeconomics",
//             "Behavioral Economics",
//             "Economic Philosophy",
//             "System Analysis",
//           ],
//           starters: [
//             "What economic concepts fascinate you?",
//             "How do you understand economic systems?",
//             "What's your economic philosophy?",
//           ],
//           examples: [
//             "Market efficiency",
//             "Economic inequality",
//             "Monetary policy",
//             "Economic schools of thought",
//           ],
//         },
//       },
//       {
//         title: "Cryptocurrency & DeFi",
//         description: {
//           overview:
//             "Navigate crypto markets, understand DeFi protocols, and explore decentralized finance.",
//           vocabulary: [
//             "Cryptocurrency",
//             "DeFi Protocols",
//             "Tokenomics",
//             "Yield Farming",
//             "Smart Contract Risk",
//             "Crypto Trading",
//             "Decentralized Finance",
//           ],
//           starters: [
//             "How do you approach crypto investing?",
//             "What DeFi protocols interest you?",
//             "What's your view on crypto's future?",
//           ],
//           examples: [
//             "DeFi yield strategies",
//             "Crypto portfolio construction",
//             "NFT investing",
//             "DAO participation",
//           ],
//         },
//       },
//       {
//         title: "Minimalist & Conscious Spending",
//         description: {
//           overview:
//             "Spend intentionally, align expenses with values, and find fulfillment beyond consumption.",
//           vocabulary: [
//             "Conscious Spending",
//             "Value-Based Budgeting",
//             "Minimalist Finance",
//             "Spending Intentionality",
//             "Financial Mindfulness",
//             "Anti-Consumerism",
//             "Financial Values",
//           ],
//           starters: [
//             "How do you decide what's worth spending on?",
//             "What spending brings genuine value?",
//             "How has minimalism affected your finances?",
//           ],
//           examples: [
//             "Values-based budgeting",
//             "Buy-it-for-life philosophy",
//             "Experience spending",
//             "Conscious consumption",
//           ],
//         },
//       },
//     ],
//   },
//   {
//     title: "Personal Development & Growth",
//     subtopics: [
//       {
//         title: "Habit Formation & Behavior Change",
//         description: {
//           overview:
//             "Build lasting habits, understand behavior change, and create systems for sustainable growth.",
//           vocabulary: [
//             "Habit Formation",
//             "Behavior Design",
//             "Keystone Habits",
//             "Identity Change",
//             "Habit Stacking",
//             "Behavior Architecture",
//             "Change Psychology",
//           ],
//           starters: [
//             "What habit changed your life?",
//             "How do you approach behavior change?",
//             "What systems support your habits?",
//           ],
//           examples: [
//             "Morning routines",
//             "Habit tracking",
//             "Tiny habits method",
//             "Environment design",
//           ],
//         },
//       },
//       {
//         title: "Productivity & Deep Work",
//         description: {
//           overview:
//             "Master focus, eliminate distractions, and produce meaningful work through deep concentration.",
//           vocabulary: [
//             "Deep Work",
//             "Focus Management",
//             "Cognitive Capacity",
//             "Flow State",
//             "Attention Training",
//             "Productivity Systems",
//             "Time Blocking",
//           ],
//           starters: [
//             "How do you protect deep work time?",
//             "What's your productivity philosophy?",
//             "How do you manage attention?",
//           ],
//           examples: [
//             "Deep work sessions",
//             "Focus rituals",
//             "Distraction elimination",
//             "Peak performance timing",
//           ],
//         },
//       },
//       {
//         title: "Goal Setting & Achievement",
//         description: {
//           overview:
//             "Set meaningful goals, create action plans, and build momentum toward ambitious objectives.",
//           vocabulary: [
//             "Goal Architecture",
//             "Systems vs Goals",
//             "Implementation Intentions",
//             "Progress Tracking",
//             "Milestone Planning",
//             "Achievement Strategy",
//             "Goal Alignment",
//           ],
//           starters: [
//             "How do you set meaningful goals?",
//             "Systems or goals—which matters more?",
//             "What goal-achievement methods work for you?",
//           ],
//           examples: [
//             "Annual planning",
//             "Quarterly goals",
//             "Process goals",
//             "Identity-based goals",
//           ],
//         },
//       },
//       {
//         title: "Self-Awareness & Inner Work",
//         description: {
//           overview:
//             "Develop self-knowledge, understand patterns, and grow through introspection and shadow work.",
//           vocabulary: [
//             "Self-Awareness",
//             "Inner Work",
//             "Shadow Integration",
//             "Psychological Insight",
//             "Self-Inquiry",
//             "Personal Patterns",
//             "Conscious Development",
//           ],
//           starters: [
//             "How do you practice self-reflection?",
//             "What inner work are you doing?",
//             "What patterns are you working to change?",
//           ],
//           examples: [
//             "Journaling practices",
//             "Therapy insights",
//             "Meditation retreats",
//             "Shadow work",
//           ],
//         },
//       },
//       {
//         title: "Communication & Interpersonal Skills",
//         description: {
//           overview:
//             "Improve communication, build stronger relationships, and navigate social dynamics effectively.",
//           vocabulary: [
//             "Communication Skills",
//             "Active Listening",
//             "Empathy",
//             "Social Intelligence",
//             "Conflict Resolution",
//             "Interpersonal Effectiveness",
//             "Relational Skills",
//           ],
//           starters: [
//             "How have you improved communication?",
//             "What communication principle changed things for you?",
//             "How do you handle difficult conversations?",
//           ],
//           examples: [
//             "Nonviolent communication",
//             "Active listening practice",
//             "Boundary setting",
//             "Empathetic communication",
//           ],
//         },
//       },
//       {
//         title: "Learning How to Learn",
//         description: {
//           overview:
//             "Optimize learning processes, understand cognition, and accelerate skill acquisition.",
//           vocabulary: [
//             "Meta-Learning",
//             "Learning Techniques",
//             "Skill Acquisition",
//             "Memory Systems",
//             "Learning Science",
//             "Cognitive Strategies",
//             "Transfer Learning",
//           ],
//           starters: [
//             "How do you optimize learning?",
//             "What learning techniques work best for you?",
//             "How do you accelerate skill development?",
//           ],
//           examples: [
//             "Spaced repetition",
//             "Deliberate practice",
//             "Feynman technique",
//             "Learning strategies",
//           ],
//         },
//       },
//       {
//         title: "Resilience & Adversity",
//         description: {
//           overview:
//             "Build psychological resilience, grow through challenges, and develop antifragility.",
//           vocabulary: [
//             "Resilience",
//             "Antifragility",
//             "Post-Traumatic Growth",
//             "Adversity Navigation",
//             "Psychological Strength",
//             "Recovery Capacity",
//             "Growth Mindset",
//           ],
//           starters: [
//             "How have you built resilience?",
//             "What adversity taught you most?",
//             "How do you approach challenges?",
//           ],
//           examples: [
//             "Overcoming setbacks",
//             "Building back stronger",
//             "Finding meaning in struggle",
//             "Developing grit",
//           ],
//         },
//       },
//     ],
//   },
// ];

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
