import { setup } from "./setup";
import { reset } from "./reset";
import { login } from "./login";
import { user } from "./user";
import { newIssue } from "./new";
import { label } from "./label";
import { logout } from "./logout";
import { role } from "./role";
import { issues } from "./issues";
import { due } from "./due";
import { state } from "./state";
import { team } from "./team";
import { comment } from "./comment";
import { manage } from "./manage";
export { helpCommandExecute } from "./help";

export const commands = [
  setup,
  reset,
  login,
  user,
  newIssue,
  label,
  logout,
  issues,
  due,
  state,
  role,
  team,
  comment,
  manage,
];
