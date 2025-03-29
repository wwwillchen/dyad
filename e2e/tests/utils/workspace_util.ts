import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(__filename);

export function getWorkspacePath(name: string): string {
  return path.join(
    dirname,
    '../../',
    'tempworkspaces',
    process.env.TEST_PARALLEL_INDEX!.toString(),
    name,
  );
}

export function doesWorkspaceFileExist(path: string): boolean {
  return fs.existsSync(getWorkspacePath(path));
}

export function readWorkspaceFile(path: string): Promise<string> {
  return fs.promises.readFile(getWorkspacePath(path), 'utf-8');
}

export function writeWorkspaceFile(
  path: string,
  content: string,
): Promise<void> {
  return fs.promises.writeFile(getWorkspacePath(path), content, 'utf-8');
}
