import type { ChatScope, Logger, ReplyTarget } from './types.js';
import type { SessionManager } from './session/manager.js';
import type { YuanbaoSender } from './transport/sender.js';

export async function handleBuiltinCommand(params: {
  text: string;
  scope: ChatScope;
  peerId: string;
  replyTarget: ReplyTarget;
  manager: SessionManager;
  sender: YuanbaoSender;
  logger: Logger;
}): Promise<boolean> {
  const command = params.text.trim();
  if (!command.startsWith('/yb-') && !command.startsWith('/yuanbao-')) return false;

  if (command === '/yb-help' || command === '/yuanbao-help') {
    await params.sender.sendText(params.replyTarget, [
      'Yuanbao DSH commands:',
      '/yb-help - show help',
      '/yb-status - show current DSH session status',
      '/yb-reset - reset current conversation session',
    ].join('\n'));
    return true;
  }

  if (command === '/yb-status' || command === '/yuanbao-status') {
    await params.sender.sendText(params.replyTarget, params.manager.getStatus(params.scope, params.peerId));
    return true;
  }

  if (command === '/yb-reset' || command === '/yuanbao-reset') {
    await params.manager.remove(params.scope, params.peerId);
    await params.sender.sendText(params.replyTarget, 'Current Yuanbao DSH session has been reset.');
    return true;
  }

  params.logger.debug(`unknown command ignored: ${command}`);
  return false;
}
