import { useEffect, useState } from 'react';
import {
  FRAUD_SIGNAL_KEYS,
  serializeFraudConfigDraft,
  toFraudConfigDraft,
  updateFraudSignalWeight,
  type FraudConfigDraft,
  type FraudSignalKey,
} from './fraud-config';

interface FraudConfigEditorProps {
  value: string;
  disabled?: boolean;
  onChange: (nextValue: string) => void;
}

type EditorMode = 'visual' | 'raw';

const SIGNAL_LABELS: Record<FraudSignalKey, string> = {
  referral_velocity: 'Referral velocity',
  self_referral_attempt: 'Self referral attempt',
  same_ip_multiple_signups: 'Same IP multiple signups',
  same_payment_fingerprint: 'Same payment fingerprint',
  high_refund_ratio_cluster: 'High refund ratio cluster',
};

export function FraudConfigEditor({ value, disabled = false, onChange }: FraudConfigEditorProps) {
  const [mode, setMode] = useState<EditorMode>('visual');
  const [draft, setDraft] = useState<FraudConfigDraft>(() => parseDraft(value));
  const [rawError, setRawError] = useState('');

  useEffect(() => {
    try {
      setDraft(parseDraft(value));
      setRawError('');
    } catch (error) {
      setRawError(error instanceof Error ? error.message : 'Fraud config raw JSON is invalid.');
    }
  }, [value]);

  function pushDraft(nextDraft: FraudConfigDraft) {
    setDraft(nextDraft);
    onChange(JSON.stringify(serializeFraudConfigDraft(nextDraft), null, 2));
    setRawError('');
  }

  function handleRawChange(nextValue: string) {
    onChange(nextValue);

    try {
      setDraft(parseDraft(nextValue));
      setRawError('');
    } catch (error) {
      setRawError(error instanceof Error ? error.message : 'Fraud config raw JSON is invalid.');
    }
  }

  function updateNumberField<K extends FraudNumberField>(key: K, rawNumber: string) {
    pushDraft({
      ...draft,
      [key]: Number(rawNumber || 0),
    });
  }

  return (
    <div className="reward-editor">
      <div className="segmented-control" role="tablist" aria-label="Fraud config editor mode">
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
            <span>Fraud scoring enabled</span>
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) => pushDraft({ ...draft, enabled: event.target.checked })}
              disabled={disabled}
            />
          </label>

          <div className="fraud-config-grid">
            <label className="field">
              <span>Case threshold</span>
              <input
                type="number"
                min={1}
                value={draft.caseThreshold}
                onChange={(event) => updateNumberField('caseThreshold', event.target.value)}
                disabled={disabled}
              />
            </label>

            <label className="field">
              <span>Score window hours</span>
              <input
                type="number"
                min={1}
                value={draft.scoreWindowHours}
                onChange={(event) => updateNumberField('scoreWindowHours', event.target.value)}
                disabled={disabled}
              />
            </label>

            <label className="field">
              <span>Cluster window days</span>
              <input
                type="number"
                min={1}
                value={draft.clusterWindowDays}
                onChange={(event) => updateNumberField('clusterWindowDays', event.target.value)}
                disabled={disabled}
              />
            </label>

            <label className="field">
              <span>Refund ratio threshold</span>
              <input
                type="number"
                min={0.01}
                step={0.01}
                value={draft.refundRatioThreshold}
                onChange={(event) => updateNumberField('refundRatioThreshold', event.target.value)}
                disabled={disabled}
              />
            </label>

            <label className="field">
              <span>Refund ratio window days</span>
              <input
                type="number"
                min={1}
                value={draft.refundRatioWindowDays}
                onChange={(event) => updateNumberField('refundRatioWindowDays', event.target.value)}
                disabled={disabled}
              />
            </label>

            <label className="field">
              <span>Velocity window minutes</span>
              <input
                type="number"
                min={1}
                value={draft.velocityWindowMinutes}
                onChange={(event) => updateNumberField('velocityWindowMinutes', event.target.value)}
                disabled={disabled}
              />
            </label>

            <label className="field">
              <span>Velocity referral count threshold</span>
              <input
                type="number"
                min={1}
                value={draft.velocityReferralCountThreshold}
                onChange={(event) =>
                  updateNumberField('velocityReferralCountThreshold', event.target.value)
                }
                disabled={disabled}
              />
            </label>
          </div>

          <div className="field">
            <div className="panel-inline reward-tier-toolbar">
              <div>
                <span className="field-label">Signal weights</span>
                <p className="muted">
                  Set the suspicion points each fraud signal contributes to the rolling score.
                </p>
              </div>
            </div>

            <div className="reward-tier-list">
              {FRAUD_SIGNAL_KEYS.map((signalKey) => (
                <div key={signalKey} className="fraud-signal-row">
                  <div>
                    <div className="field-label">Signal</div>
                    <div className="fraud-signal-name">{SIGNAL_LABELS[signalKey]}</div>
                  </div>

                  <label className="field">
                    <span>Weight</span>
                    <input
                      type="number"
                      min={1}
                      value={draft.signalWeights[signalKey]}
                      onChange={(event) =>
                        pushDraft(
                          updateFraudSignalWeight(
                            draft,
                            signalKey,
                            Number(event.target.value || 0),
                          ),
                        )
                      }
                      disabled={disabled}
                    />
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <label className="field">
          <span>Fraud config JSON</span>
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

type FraudNumberField =
  | 'caseThreshold'
  | 'scoreWindowHours'
  | 'clusterWindowDays'
  | 'refundRatioThreshold'
  | 'refundRatioWindowDays'
  | 'velocityWindowMinutes'
  | 'velocityReferralCountThreshold';

function parseDraft(raw: string): FraudConfigDraft {
  const parsed = JSON.parse(raw);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('Fraud config must be a JSON object.');
  }
  return toFraudConfigDraft(parsed);
}
