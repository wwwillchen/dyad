import type { LocalAgentFixture } from "../../../../testing/fake-llm-server/localAgentTypes";

export const fixture: LocalAgentFixture = {
  description: "Create an app blueprint that renames the current app on approval",
  turns: [
    {
      text: "Let me confirm the blueprint direction first.",
      toolCalls: [
        {
          name: "planning_questionnaire",
          args: {
            questions: [
              {
                id: "blueprint-preferences",
                type: "radio",
                question: "Should I use the requested design direction?",
                options: ["Use the requested direction"],
                required: true,
              },
            ],
          },
        },
      ],
    },
    {
      text: "I drafted an app blueprint for this app.",
      toolCalls: [
        {
          name: "write_app_blueprint",
          args: {
            app_name: "Lumen Notes",
            user_prompt: "Build me a beautiful notes app",
            template_id: "react",
            theme_id: "default",
            design_direction:
              "Clean and polished productivity interface with warm accents.",
            primary_color: "#F59E0B",
            visuals: [
              {
                type: "logo",
                description: "App logo for the notes dashboard",
                prompt: "Minimal notes app logo in amber tones",
              },
            ],
          },
        },
      ],
    },
  ],
};
