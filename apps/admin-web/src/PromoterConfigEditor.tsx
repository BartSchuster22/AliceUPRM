import { useEffect, useState } from 'react';
import {
  addPromoterType,
  addPromoterTypeTier,
  deletePromoterType,
  deletePromoterTypeTier,
  serializePromoterConfigDraft,
  setPromoterTypeEnabled,
  toPromoterConfigDraft,
  updatePromoterType,
  updatePromoterTypeTier,
  type PromoterConfigDraft,
} from './promoter-config';

interface PromoterConfigEditorProps {
  value: string;
  disabled?: boolean;
  onChange: (nextValue: string) => void;
}

type EditorMode = 'visual' | 'raw';

export function PromoterConfigEditor({
  value,
  disabled = false,
  onChange,
}: PromoterConfigEditorProps) {
  const [mode, setMode] = useState<EditorMode>('visual');
  const [draft, setDraft] = useState<PromoterConfigDraft>(() => parseDraft(value));
  const [rawError, setRawError] = useState('');

  useEffect(() => {
    try {
      setDraft(parseDraft(value));
      setRawError('');
    } catch (error) {
      setRawError(error instanceof Error ? error.message : 'Promoter config raw JSON is invalid.');
    }
  }, [value]);

  function pushDraft(nextDraft: PromoterConfigDraft) {
    setDraft(nextDraft);
    onChange(JSON.stringify(serializePromoterConfigDraft(nextDraft), null, 2));
    setRawError('');
  }

  function handleRawChange(nextValue: string) {
    onChange(nextValue);
    try {
      setDraft(parseDraft(nextValue));
      setRawError('');
    } catch (error) {
      setRawError(error instanceof Error ? error.message : 'Promoter config raw JSON is invalid.');
    }
  }

  return (
    <div className="reward-editor">
      <div className="segmented-control" role="tablist" aria-label="Promoter config editor mode">
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
          <label className="field toggle-field">
            <span>Promoter bonuses enabled</span>
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) => pushDraft({ ...draft, enabled: event.target.checked })}
              disabled={disabled}
            />
          </label>

          <div className="field">
            <div className="panel-inline reward-tier-toolbar">
              <div>
                <span className="field-label">Promoter types</span>
                <p className="muted">
                  Add promoter layers and define the extra bonus percentages or flat amounts they
                  get on top of the standard reward ladder.
                </p>
              </div>
              <button
                type="button"
                className="secondary"
                onClick={() => pushDraft(addPromoterType(draft))}
                disabled={disabled}
              >
                Add promoter type
              </button>
            </div>

            {draft.types.length ? (
              <div className="reward-tier-list">
                {draft.types.map((typeRecord) => (
                  <div
                    key={typeRecord.key}
                    className={
                      !typeRecord.enabled ? 'promoter-type-card is-disabled' : 'promoter-type-card'
                    }
                  >
                    <div className="promoter-type-header">
                      <label className="toggle-field reward-tier-toggle">
                        <span>Enabled</span>
                        <input
                          type="checkbox"
                          checked={typeRecord.enabled}
                          onChange={(event) =>
                            pushDraft(
                              setPromoterTypeEnabled(draft, typeRecord.key, event.target.checked),
                            )
                          }
                          disabled={disabled}
                        />
                      </label>

                      <label className="field promoter-type-key-field">
                        <span>Promoter type</span>
                        <input
                          value={typeRecord.key}
                          onChange={(event) =>
                            pushDraft(
                              updatePromoterType(draft, typeRecord.key, {
                                key: event.target.value,
                              }),
                            )
                          }
                          disabled={disabled}
                        />
                      </label>

                      <button
                        type="button"
                        className="secondary reward-tier-delete"
                        onClick={() => pushDraft(deletePromoterType(draft, typeRecord.key))}
                        disabled={disabled}
                      >
                        Delete
                      </button>
                    </div>

                    <div className="panel-inline promoter-tier-toolbar">
                      <div>
                        <span className="field-label">Bonus tiers</span>
                        <p className="muted">
                          These bonuses are added to the standard reward percentages by matching
                          depth.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => pushDraft(addPromoterTypeTier(draft, typeRecord.key))}
                        disabled={disabled}
                      >
                        Add tier
                      </button>
                    </div>

                    <div className="reward-tier-list">
                      {typeRecord.bonusTiers.map((tier) => (
                        <div
                          key={`${typeRecord.key}:${tier.depth}`}
                          className="reward-tier-row promoter-tier-row"
                        >
                          <div className="reward-tier-depth">Depth {tier.depth}</div>

                          <label className="field">
                            <span>Type</span>
                            <select
                              value={tier.type}
                              onChange={(event) =>
                                pushDraft(
                                  updatePromoterTypeTier(draft, typeRecord.key, tier.depth, {
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
                                  updatePromoterTypeTier(draft, typeRecord.key, tier.depth, {
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
                            onClick={() =>
                              pushDraft(deletePromoterTypeTier(draft, typeRecord.key, tier.depth))
                            }
                            disabled={disabled}
                          >
                            Delete
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state-inline">
                No promoter types yet. Add the first promoter layer to define bonus rewards.
              </div>
            )}
          </div>
        </div>
      ) : (
        <label className="field">
          <span>Promoter config JSON</span>
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

function parseDraft(raw: string): PromoterConfigDraft {
  const parsed = JSON.parse(raw);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('Promoter config must be a JSON object.');
  }
  return toPromoterConfigDraft(parsed);
}
