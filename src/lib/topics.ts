export type Topic = { text: string; kind: string };

export const TOPICS: Topic[] = [
  // Everyday life
  { kind: "Everyday", text: "Describe your perfect Sunday from morning to night." },
  { kind: "Everyday", text: "What did you do yesterday? Walk me through your day." },
  { kind: "Everyday", text: "Describe the place where you grew up." },
  { kind: "Everyday", text: "What is your favourite food, and how is it made?" },
  { kind: "Everyday", text: "Tell me about a festival you love and how you celebrate it." },
  { kind: "Everyday", text: "Describe your morning routine. What would you change about it?" },
  { kind: "Everyday", text: "What is the best trip you have ever taken?" },
  { kind: "Everyday", text: "Describe a friend who has influenced your life." },
  { kind: "Everyday", text: "What do you do to relax after a stressful day?" },
  { kind: "Everyday", text: "Describe your home to someone who has never seen it." },
  { kind: "Everyday", text: "What is a small habit that makes your life better?" },
  { kind: "Everyday", text: "Tell me about a movie or show you watched recently." },

  // Work
  { kind: "Work", text: "Introduce yourself as you would in a job interview." },
  { kind: "Work", text: "Explain what you do at work to a ten-year-old." },
  { kind: "Work", text: "Describe a problem you solved at work and how you did it." },
  { kind: "Work", text: "What makes a good manager?" },
  { kind: "Work", text: "Tell me about a time you made a mistake at work and what you learned." },
  { kind: "Work", text: "Give a one-minute update on a project you are working on." },
  { kind: "Work", text: "Convince me to hire you for your dream job." },
  { kind: "Work", text: "Should people work from home or from the office?" },
  { kind: "Work", text: "How do you handle a disagreement with a colleague?" },
  { kind: "Work", text: "What skill would you like to learn this year, and why?" },
  { kind: "Work", text: "Describe the best team you have ever been part of." },
  { kind: "Work", text: "Explain a technical idea from your field in simple words." },

  // Ideas from the books
  { kind: "Big ideas", text: "What does freedom mean to you?" },
  { kind: "Big ideas", text: "Can a person be happy without wanting anything?" },
  { kind: "Big ideas", text: "Is it better to live in the moment or plan for the future?" },
  { kind: "Big ideas", text: "What is the difference between knowledge and wisdom?" },
  { kind: "Big ideas", text: "Why do people find it hard to be alone?" },
  { kind: "Big ideas", text: "What does it mean to love someone without trying to own them?" },
  { kind: "Big ideas", text: "Is meditation useful for ordinary people? Why or why not?" },
  { kind: "Big ideas", text: "Should we follow tradition, or question everything?" },
  { kind: "Big ideas", text: "What would you do if you were not afraid?" },
  { kind: "Big ideas", text: "Is silence more powerful than words?" },
  { kind: "Big ideas", text: "What makes a life meaningful?" },
  { kind: "Big ideas", text: "Can you learn more from books or from experience?" },
  { kind: "Big ideas", text: "Is anger always bad?" },
  { kind: "Big ideas", text: "What does it mean to be truly yourself?" },

  // Opinions
  { kind: "Opinion", text: "Are smartphones making us more or less connected?" },
  { kind: "Opinion", text: "Should children learn more than one language at school?" },
  { kind: "Opinion", text: "Is social media good for society?" },
  { kind: "Opinion", text: "City life or village life: which is better?" },
  { kind: "Opinion", text: "Should everyone learn to cook?" },
  { kind: "Opinion", text: "Is it important to travel abroad?" },
  { kind: "Opinion", text: "Will artificial intelligence change the way we work?" },
  { kind: "Opinion", text: "Is money the most important thing in choosing a job?" },
  { kind: "Opinion", text: "Should exams be the main way to judge students?" },
  { kind: "Opinion", text: "Are people kinder today than in the past?" },

  // Stories
  { kind: "Story", text: "Tell me about the happiest day of your life." },
  { kind: "Story", text: "Describe a time you felt very proud of yourself." },
  { kind: "Story", text: "Tell me a funny thing that happened to you." },
  { kind: "Story", text: "Describe a moment that changed the way you think." },
  { kind: "Story", text: "Tell me about a teacher you will never forget." },
  { kind: "Story", text: "Describe a time you helped a stranger, or a stranger helped you." },
  { kind: "Story", text: "Tell me about a difficult decision you had to make." },
  { kind: "Story", text: "Retell the story of a book or movie you love." },
  { kind: "Story", text: "Describe a childhood memory that still makes you smile." },
  { kind: "Story", text: "Tell me about a time you got lost." },
];

export const TOPIC_KINDS = ["All", ...Array.from(new Set(TOPICS.map((t) => t.kind)))];
