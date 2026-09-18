import React, { useState, useEffect } from 'react';
import {
  BotCredential,
  MessagingPlatform,
  loadCredentials,
  saveCredential,
  deleteCredential,
} from '../../storage/credentialStore';
import { Icon } from '../common/Icon';
import { Plus, Trash2, Edit3, X, Check, Key, ShieldCheck, ExternalLink } from 'lucide-react';

interface BotCredentialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultPlatform?: MessagingPlatform;
  onSelectCredential?: (cred: BotCredential) => void;
}

export const BotCredentialsModal: React.FC<BotCredentialsModalProps> = ({
  isOpen,
  onClose,
  defaultPlatform = 'telegram',
  onSelectCredential,
}) => {
  const [activePlatform, setActivePlatform] = useState<MessagingPlatform>(defaultPlatform);
  const [credentials, setCredentials] = useState<BotCredential[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [formName, setFormName] = useState('');
  // Telegram
  const [formBotToken, setFormBotToken] = useState('');
  const [formChatId, setFormChatId] = useState('');
  // Discord
  const [formDiscordMode, setFormDiscordMode] = useState<'webhook' | 'bot'>('webhook');
  const [formWebhookUrl, setFormWebhookUrl] = useState('');
  const [formDiscordBotToken, setFormDiscordBotToken] = useState('');
  const [formDiscordChannelId, setFormDiscordChannelId] = useState('');
  const [formDiscordUsername, setFormDiscordUsername] = useState('');
  // Slack
  const [formSlackMode, setFormSlackMode] = useState<'webhook' | 'bot'>('webhook');
  const [formSlackWebhookUrl, setFormSlackWebhookUrl] = useState('');
  const [formSlackBotToken, setFormSlackBotToken] = useState('');
  const [formSlackChannel, setFormSlackChannel] = useState('');
  const [formSlackUsername, setFormSlackUsername] = useState('');
  const [formSlackEmoji, setFormSlackEmoji] = useState(':robot_face:');

  const reload = async () => {
    const list = await loadCredentials();
    setCredentials(list);
  };

  useEffect(() => {
    if (isOpen) {
      reload();
      if (defaultPlatform) {
        setActivePlatform(defaultPlatform);
      }
    }
  }, [isOpen, defaultPlatform]);

  if (!isOpen) return null;

  const filtered = credentials.filter((c) => c.platform === activePlatform);

  const resetForm = () => {
    setIsEditing(false);
    setEditingId(null);
    setFormName('');
    setFormBotToken('');
    setFormChatId('');
    setFormDiscordMode('webhook');
    setFormWebhookUrl('');
    setFormDiscordBotToken('');
    setFormDiscordChannelId('');
    setFormDiscordUsername('');
    setFormSlackMode('webhook');
    setFormSlackWebhookUrl('');
    setFormSlackBotToken('');
    setFormSlackChannel('');
    setFormSlackUsername('');
    setFormSlackEmoji(':robot_face:');
  };

  const startEdit = (cred: BotCredential) => {
    setIsEditing(true);
    setEditingId(cred.id);
    setFormName(cred.name);
    if (cred.platform === 'telegram') {
      setFormBotToken(cred.botToken || '');
      setFormChatId(cred.defaultChatId || '');
    } else if (cred.platform === 'discord') {
      setFormDiscordMode(cred.mode || 'webhook');
      setFormWebhookUrl(cred.webhookUrl || '');
      setFormDiscordBotToken(cred.botToken || '');
      setFormDiscordChannelId(cred.channelId || '');
      setFormDiscordUsername(cred.username || '');
    } else if (cred.platform === 'slack') {
      setFormSlackMode(cred.mode || 'webhook');
      setFormSlackWebhookUrl(cred.webhookUrl || '');
      setFormSlackBotToken(cred.botToken || '');
      setFormSlackChannel(cred.channel || '');
      setFormSlackUsername(cred.username || '');
      setFormSlackEmoji(cred.iconEmoji || ':robot_face:');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    if (activePlatform === 'telegram') {
      await saveCredential({
        id: editingId || undefined,
        platform: 'telegram',
        name: formName,
        botToken: formBotToken,
        defaultChatId: formChatId,
      });
    } else if (activePlatform === 'discord') {
      await saveCredential({
        id: editingId || undefined,
        platform: 'discord',
        name: formName,
        mode: formDiscordMode,
        webhookUrl: formWebhookUrl,
        botToken: formDiscordBotToken,
        channelId: formDiscordChannelId,
        username: formDiscordUsername,
      });
    } else if (activePlatform === 'slack') {
      await saveCredential({
        id: editingId || undefined,
        platform: 'slack',
        name: formName,
        mode: formSlackMode,
        webhookUrl: formSlackWebhookUrl,
        botToken: formSlackBotToken,
        channel: formSlackChannel,
        username: formSlackUsername,
        iconEmoji: formSlackEmoji,
      });
    }

    await reload();
    resetForm();
  };

  const handleDelete = async (id: string) => {
    await deleteCredential(id);
    await reload();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-[#0c0e14] border border-[#232a3b] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-[#1c2230] bg-[#11141c] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-600/20 border border-teal-500/30 flex items-center justify-center text-teal-400">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">Saved Bot Credentials</h2>
              <p className="text-xs text-gray-400">
                Manage reusable tokens and webhooks for Telegram, Discord, and Slack
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1c2230] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Platform Tabs */}
        <div className="flex border-b border-[#1c2230] bg-[#11141c]/50 px-4 pt-2">
          {(['telegram', 'discord', 'slack'] as MessagingPlatform[]).map((plat) => {
            const count = credentials.filter((c) => c.platform === plat).length;
            const isActive = activePlatform === plat;
            return (
              <button
                key={plat}
                onClick={() => {
                  setActivePlatform(plat);
                  resetForm();
                }}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all capitalize ${
                  isActive
                    ? 'border-teal-500 text-white bg-[#161a24]/60'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                <Icon
                  name={plat === 'telegram' ? 'Send' : plat === 'discord' ? 'MessageSquare' : 'Hash'}
                  className="w-3.5 h-3.5"
                />
                <span>{plat}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-teal-500/20 text-teal-300' : 'bg-[#1c2230] text-gray-500'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* List or Form */}
          {!isEditing ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-gray-400 text-xs font-medium">
                  Configured Accounts ({filtered.length})
                </span>
                <button
                  onClick={() => {
                    resetForm();
                    setIsEditing(true);
                    setFormName(
                      `${activePlatform.charAt(0).toUpperCase() + activePlatform.slice(1)} Profile ${
                        filtered.length + 1
                      }`
                    );
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-medium text-xs transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Account</span>
                </button>
              </div>

              {filtered.length === 0 ? (
                <div className="p-8 text-center rounded-xl bg-[#11141c] border border-[#1c2230] space-y-2">
                  <Key className="w-8 h-8 mx-auto text-gray-600" />
                  <p className="text-gray-400 font-medium">No saved {activePlatform} credentials yet.</p>
                  <p className="text-[11px] text-gray-500">
                    Add one now so you never have to paste tokens or webhook URLs into workflow nodes again.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filtered.map((cred) => (
                    <div
                      key={cred.id}
                      className="p-3 rounded-xl bg-[#11141c] border border-[#1c2230] hover:border-[#2a3449] transition-all flex items-center justify-between"
                    >
                      <div className="overflow-hidden pr-3">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white">{cred.name}</span>
                          <span className="text-[10px] bg-teal-500/10 text-teal-400 border border-teal-500/20 px-1.5 py-0.2 rounded font-mono">
                            {cred.mode ? cred.mode.toUpperCase() : 'BOT'}
                          </span>
                        </div>
                        <div className="text-[11px] text-gray-400 font-mono mt-1 truncate">
                          {cred.platform === 'telegram' &&
                            `Chat: ${cred.defaultChatId || 'Not set'} • Token: ••••••••${(
                              cred.botToken || ''
                            ).slice(-6)}`}
                          {cred.platform === 'discord' &&
                            (cred.mode === 'bot'
                              ? `Channel: ${cred.channelId || 'Not set'} • Bot: ••••••••${(
                                  cred.botToken || ''
                                ).slice(-6)}`
                              : `Webhook: ${(cred.webhookUrl || '').slice(0, 45)}...`)}
                          {cred.platform === 'slack' &&
                            (cred.mode === 'bot'
                              ? `Channel: ${cred.channel || 'Not set'} • Token: ••••••••${(
                                  cred.botToken || ''
                                ).slice(-6)}`
                              : `Webhook: ${(cred.webhookUrl || '').slice(0, 45)}...`)}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {onSelectCredential && (
                          <button
                            onClick={() => {
                              onSelectCredential(cred);
                              onClose();
                            }}
                            className="px-2.5 py-1 rounded bg-teal-600/20 hover:bg-teal-600 text-teal-300 hover:text-white text-xs font-medium transition-colors"
                          >
                            Select
                          </button>
                        )}
                        <button
                          onClick={() => startEdit(cred)}
                          className="p-1.5 rounded hover:bg-[#1c2230] text-gray-400 hover:text-white transition-colors"
                          title="Edit Credential"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(cred.id)}
                          className="p-1.5 rounded hover:bg-rose-500/10 text-gray-400 hover:text-rose-400 transition-colors"
                          title="Delete Credential"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Add/Edit Form */
            <form onSubmit={handleSave} className="space-y-3 bg-[#11141c] p-4 rounded-xl border border-[#1c2230]">
              <div className="flex items-center justify-between border-b border-[#1c2230] pb-2">
                <span className="font-semibold text-white">
                  {editingId ? `Edit ${activePlatform} Profile` : `New ${activePlatform} Profile`}
                </span>
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">
                  Profile Name / Label *
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. My Alerts Bot, Production Channel"
                  className="w-full bg-[#161a24] text-white p-2 rounded-lg border border-[#232a3b] focus:border-teal-500 outline-none text-xs"
                />
              </div>

              {/* Telegram Form */}
              {activePlatform === 'telegram' && (
                <>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-400 mb-1">
                      Telegram Bot Token *
                    </label>
                    <input
                      type="password"
                      required
                      value={formBotToken}
                      onChange={(e) => setFormBotToken(e.target.value)}
                      placeholder="123456789:ABCDefGhIjKlmNoPQR"
                      className="w-full bg-[#161a24] text-white p-2 rounded-lg border border-[#232a3b] focus:border-teal-500 outline-none font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-400 mb-1">
                      Default Chat ID or @Channel (Optional)
                    </label>
                    <input
                      type="text"
                      value={formChatId}
                      onChange={(e) => setFormChatId(e.target.value)}
                      placeholder="-100123456789 or @mychannel"
                      className="w-full bg-[#161a24] text-white p-2 rounded-lg border border-[#232a3b] focus:border-teal-500 outline-none font-mono text-xs"
                    />
                  </div>
                </>
              )}

              {/* Discord Form */}
              {activePlatform === 'discord' && (
                <>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-400 mb-1">Mode</label>
                    <select
                      value={formDiscordMode}
                      onChange={(e) => setFormDiscordMode(e.target.value as any)}
                      className="w-full bg-[#161a24] text-white p-2 rounded-lg border border-[#232a3b] outline-none text-xs"
                    >
                      <option value="webhook">Incoming Webhook URL</option>
                      <option value="bot">Bot Token + Channel ID</option>
                    </select>
                  </div>

                  {formDiscordMode === 'webhook' ? (
                    <div>
                      <label className="block text-[11px] font-medium text-gray-400 mb-1">
                        Discord Webhook URL *
                      </label>
                      <input
                        type="text"
                        required
                        value={formWebhookUrl}
                        onChange={(e) => setFormWebhookUrl(e.target.value)}
                        placeholder="https://discord.com/api/webhooks/..."
                        className="w-full bg-[#161a24] text-white p-2 rounded-lg border border-[#232a3b] focus:border-teal-500 outline-none font-mono text-xs"
                      />
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-400 mb-1">
                          Discord Bot Token *
                        </label>
                        <input
                          type="password"
                          required
                          value={formDiscordBotToken}
                          onChange={(e) => setFormDiscordBotToken(e.target.value)}
                          placeholder="MTAx..."
                          className="w-full bg-[#161a24] text-white p-2 rounded-lg border border-[#232a3b] focus:border-teal-500 outline-none font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-400 mb-1">
                          Channel ID *
                        </label>
                        <input
                          type="text"
                          required
                          value={formDiscordChannelId}
                          onChange={(e) => setFormDiscordChannelId(e.target.value)}
                          placeholder="123456789012345678"
                          className="w-full bg-[#161a24] text-white p-2 rounded-lg border border-[#232a3b] focus:border-teal-500 outline-none font-mono text-xs"
                        />
                      </div>
                    </>
                  )}
                  <div>
                    <label className="block text-[11px] font-medium text-gray-400 mb-1">
                      Default Bot Name (Optional)
                    </label>
                    <input
                      type="text"
                      value={formDiscordUsername}
                      onChange={(e) => setFormDiscordUsername(e.target.value)}
                      placeholder="AutoFlow Bot"
                      className="w-full bg-[#161a24] text-white p-2 rounded-lg border border-[#232a3b] outline-none text-xs"
                    />
                  </div>
                </>
              )}

              {/* Slack Form */}
              {activePlatform === 'slack' && (
                <>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-400 mb-1">Mode</label>
                    <select
                      value={formSlackMode}
                      onChange={(e) => setFormSlackMode(e.target.value as any)}
                      className="w-full bg-[#161a24] text-white p-2 rounded-lg border border-[#232a3b] outline-none text-xs"
                    >
                      <option value="webhook">Incoming Webhook URL</option>
                      <option value="bot">Bot User OAuth Token (xoxb-...)</option>
                    </select>
                  </div>

                  {formSlackMode === 'webhook' ? (
                    <div>
                      <label className="block text-[11px] font-medium text-gray-400 mb-1">
                        Slack Webhook URL *
                      </label>
                      <input
                        type="text"
                        required
                        value={formSlackWebhookUrl}
                        onChange={(e) => setFormSlackWebhookUrl(e.target.value)}
                        placeholder="https://hooks.slack.com/services/..."
                        className="w-full bg-[#161a24] text-white p-2 rounded-lg border border-[#232a3b] focus:border-teal-500 outline-none font-mono text-xs"
                      />
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-400 mb-1">
                          Slack Bot User Token *
                        </label>
                        <input
                          type="password"
                          required
                          value={formSlackBotToken}
                          onChange={(e) => setFormSlackBotToken(e.target.value)}
                          placeholder="xoxb-..."
                          className="w-full bg-[#161a24] text-white p-2 rounded-lg border border-[#232a3b] focus:border-teal-500 outline-none font-mono text-xs"
                        />
                      </div>
                    </>
                  )}
                  <div>
                    <label className="block text-[11px] font-medium text-gray-400 mb-1">
                      Target Channel / Channel Override (Optional)
                    </label>
                    <input
                      type="text"
                      value={formSlackChannel}
                      onChange={(e) => setFormSlackChannel(e.target.value)}
                      placeholder="#general or C1234567890"
                      className="w-full bg-[#161a24] text-white p-2 rounded-lg border border-[#232a3b] outline-none text-xs font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-gray-400 mb-1">
                        Bot Name (Optional)
                      </label>
                      <input
                        type="text"
                        value={formSlackUsername}
                        onChange={(e) => setFormSlackUsername(e.target.value)}
                        placeholder="AutoFlow Bot"
                        className="w-full bg-[#161a24] text-white p-1.5 rounded-lg border border-[#232a3b] outline-none text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-400 mb-1">
                        Icon Emoji (Optional)
                      </label>
                      <input
                        type="text"
                        value={formSlackEmoji}
                        onChange={(e) => setFormSlackEmoji(e.target.value)}
                        placeholder=":robot_face:"
                        className="w-full bg-[#161a24] text-white p-1.5 rounded-lg border border-[#232a3b] outline-none text-xs font-mono"
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1c2230]">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-3 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#161a24] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-medium transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Profile</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[#1c2230] bg-[#11141c] flex items-center justify-between text-[11px] text-gray-400">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
            <span>Credentials are stored securely in browser extension storage</span>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded bg-[#1c2230] hover:bg-[#252c3d] text-white transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
