import { exec } from "node:child_process";
import * as os from "node:os";
import notifier from "node-notifier";

interface NotifyOptions {
  title: string;
  message: string;
}

const playSoundCommand = () => {
  const platformName = os.platform();
  if (platformName === "darwin") return "afplay /System/Library/Sounds/Glass.aiff";
  if (platformName === "win32")
    return "powershell -c (New-Object Media.SoundPlayer 'C:\\Windows\\Media\\chimes.wav').PlaySync()";
  return "paplay /usr/share/sounds/freedesktop/stereo/complete.oga 2>/dev/null || aplay /usr/share/sounds/freedesktop/stereo/complete.oga 2>/dev/null";
};

export const playSound = () =>
  new Promise<void>((resolve) => {
    exec(playSoundCommand(), () => resolve());
  });

export const notify = (options: NotifyOptions) =>
  new Promise<void>((resolve) => {
    notifier.notify({ title: options.title, message: options.message, sound: false }, () =>
      resolve(),
    );
  });

export const playSoundAndNotify = (options: NotifyOptions) =>
  Promise.all([playSound(), notify(options)]).then(() => undefined);
