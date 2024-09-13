import { getLastRunCommand } from "../../program";

export async function getLastRunHandler(
  options: ReturnType<ReturnType<typeof getLastRunCommand>["opts"]>
) {
  console.log('get-last-run', { options });
}
