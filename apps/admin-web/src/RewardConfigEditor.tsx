import { useEffect, useState } from 'react';
import {
  addTier,
  DEFAULT_REWARD_TRIGGERS,
  deleteTier,
  FIXED_REWARD_CURRENCY,
  serializeRewardConfigDraft,
  setTierEnabled,
  toRewardConfigDraft,
  updateTier,
  type RewardConfigDraft,
} from './reward-config';

interface RewardConfigEditorProps {
  value: string;
  disabled?: boolean;
  onChange: (nextValue: string) => void;
}

type EditorMode = 'visual' | 'raw';

export function RewardConfigEditor({ value, disabled = false, onChange }: RewardConfigEditorProps) {
  const [mode, setMode] = useState<EditorMode>('visual');
  const [draft, setDraft] = useState<RewardConfigDraft>(() => parseDraft(value));
  const [rawError, setRawError] = useState('');

  useEffect(() => {
    try {
      setDraft(parseDraft(value));
      setRawError('');
    } catch (error) {
      setRawError(error instanceof Error ? error.message : 'Reward config raw JSON is invalid.');
    }
  }, [value]);

  function pushDraft(nextDraft: RewardConfigDraft) {
    setDraft(nextDraft);
    onChange(JSON.stringify(serializeRewardConfigDraft(nextDraft), null, 2));
    setRawError('');
  }

  function handleRawChange(nextValue: string) {
    onChange(nextValue);

    try {
      setDraft(parseDraft(nextValue));
      setRawError('');
    } catch (error) {
      setRawError(error instanceof Error ? error.message : 'Reward config raw JSON is invalid.');
    }
  }

  return (
    <div className="reward-editor">
      <div className="segmented-control" role="tablist" aria-label="Reward config editor mode">
        <button
          type="button"
          className={mode === 'visual' ? 'secondary active' : 'secondary'}
          onClick={() => setMode('visual')}
          disabled={disabled}
        >
          Visual editor
        </button>
        <button
          type="button"
          className={mode === 'raw' ? 'secondary active' : 'secondary'}
          onClick={() => setMode('raw')}
          disabled={disabled}
        >
          Raw code
        </button>
      </div>

      {mode === 'visual' ? (
        <div className="reward-editor-stack">
          <div className="reward-editor-summary-card">
            <div>
              <div className="field-label">Reward rulebook</div>
              <p className="muted">
                Click editor for tiers and toggles. Raw code stays available any time.
              </p>
            </div>
            <div className="reward-editor-summary-stats">
              <span className="reward-stat-pill">
                {draft.enabled ? 'Global: enabled' : 'Global: disabled'}
              </span>
              <span className="reward-stat-pill">
                {draft.tiers.length} tier{draft.tiers.length === 1 ? '' : 's'}
              </span>
              <span className="reward-stat-pill">Currency: {FIXED_REWARD_CURRENCY}</span>
            </div>
          </div>

          <div className="reward-editor-meta-grid">
            <label className="field toggle-field reward-toggle-card">
              <span>
                <strong>Global enabled</strong>
                <small className="muted reward-help-text">
                  Turns the tenant reward program on or off.
                </small>
              </span>
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(event) =>
                  pushDraft({
                    ...draft,
                    enabled: event.target.checked,
                  })
                }
                disabled={disabled}
              />
            </label>

            <label className="field reward-readonly-card">
              <span>Currency</span>
              <input value={FIXED_REWARD_CURRENCY} readOnly disabled />
              <small className="muted reward-help-text">
                Fixed internal unit for payouts and accounting.
              </small>
            </label>

            <label className="field reward-readonly-card">
              <span>Settlement window days</span>
              <input
                type="number"
                min={0}
                max={90}
                value={draft.settlementWindowDays}
                onChange={(event) =>
                  pushDraft({
                    ...draft,
                    settlementWindowDays: Number(event.target.value || 0),
                  })
                }
                disabled={disabled}
              />
              <small className="muted reward-help-text">
                How long rewards wait before settlement.
              </small>
            </label>
          </div>

          <div className="field reward-readonly-card">
            <span>Triggers</span>
            <div className="pill-list">
              {(draft.triggers.length ? draft.triggers : DEFAULT_REWARD_TRIGGERS).map((trigger) => (
                <span key={trigger} className="pill">
                  {trigger}
                </span>
              ))}
            </div>
            <small className="muted reward-help-text">
              These events currently activate reward evaluation.
            </small>
          </div>

          <div className="field">
            <div className="panel-inline reward-tier-toolbar">
              <div>
                <span className="field-label">Tiers</span>
                <p className="muted">
                  Add, edit, enable, or delete reward levels. Toggling depth 2 also toggles every
                  tier below it.
                </p>
              </div>
              <button
                type="button"
                className="secondary"
                onClick={() => pushDraft(addTier(draft))}
                disabled={disabled}
              >
                Add tier below last depth
              </button>
            </div>

            {draft.tiers.length ? (
              <div className="reward-tier-list">
                {draft.tiers.map((tier) => (
                  <div
                    key={tier.depth}
                    className={!tier.enabled ? 'reward-tier-row is-disabled' : 'reward-tier-row'}
                  >
                    <div className="reward-tier-header">
                      <div className="reward-tier-depth-badge">Depth {tier.depth}</div>
                      <small className="muted reward-help-text">
                        {tier.depth === 1
                          ? 'Top reward level'
                          : `Enabled toggle here also affects depth ${tier.depth} and below.`}
                      </small>
                    </div>

                    <label className="toggle-field reward-tier-toggle reward-toggle-card">
                      <span>
                        <strong>Enabled</strong>
                        <small className="muted reward-help-text">Cascade starts here.</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={tier.enabled}
                        onChange={(event) =>
                          pushDraft(setTierEnabled(draft, tier.depth, event.target.checked))
                        }
                        disabled={disabled}
                      />
                    </label>

                    <label className="field">
                      <span>Type</span>
                      <select
                        value={tier.type}
                        onChange={(event) =>
                          pushDraft(
                            updateTier(draft, tier.depth, {
                              type: event.target.value === 'flat' ? 'flat' : 'percent',
                            }),
                          )
                        }
                        disabled={disabled}
                      >
                        <option value="percent">percent</option>
                        <option value="flat">flat</option>
                      </select>
                    </label>

                    <label className="field">
                      <span>Value</span>
                      <input
                        value={tier.value}
                        onChange={(event) =>
                          pushDraft(
                            updateTier(draft, tier.depth, {
                              value: event.target.value,
                            }),
                          )
                        }
                        disabled={disabled}
                      />
                    </label>

                    <button
                      type="button"
                      className="secondary reward-tier-delete"
                      onClick={() => pushDraft(deleteTier(draft, tier.depth))}
                      disabled={disabled}
                    >
                      Delete tier
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state-inline reward-empty-state">
                <div>
                  <strong>No tiers yet.</strong>
                  <p className="muted">Add the first reward tier to start the ladder.</p>
                </div>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => pushDraft(addTier(draft))}
                  disabled={disabled}
                >
                  Add first tier
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <label className="field">
          <span>Reward config JSON</span>
          <textarea
            value={value}
            rows={14}
            onChange={(event) => handleRawChange(event.target.value)}
            disabled={disabled}
          />
          {rawError ? <small className="error-text">{rawError}</small> : null}
        </label>
      )}
    </div>
  );
}

function parseDraft(raw: string): RewardConfigDraft {
  const parsed = JSON.parse(raw);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('Reward config must be a JSON object.');
  }
  return toRewardConfigDraft(parsed);
}
