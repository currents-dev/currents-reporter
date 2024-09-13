import { getCurrentsAPICommand } from "../../program";

export async function apiHandler(
  options: ReturnType<ReturnType<typeof getCurrentsAPICommand>["opts"]>
) {
  console.log('api', { options });
}
