import { getGithubUser } from "../handlers/github_handlers";

export async function getGitAuthor() {
  const user = await getGithubUser();
  const author = user
    ? {
        name: "Dyad",
        email: user.email,
      }
    : {
        name: "Dyad",
        email: "git@dyad.sh",
      };
  return author;
}
