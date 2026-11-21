import { useState } from "react";
import { audioManager } from "../engine/audio/AudioManager";
import { TEST_FORM_CONTROLS, defaultTestForm, TEST_FORM_FIGHTERS } from "../engine/testForms";

// Optional step after the prediction: lets the player start a listed fighter in
// a non-standard form. A card left switched off plays normally, and SKIP starts
// the battle with no forms at all. onConfirm receives only the switched-on cards,
// keyed by fighter name.
export default function EnemyFormsModal({ fighters, onConfirm, onSkip, onCancel }) {
  const testable = fighters.filter((fighter, i) => (
    TEST_FORM_FIGHTERS.includes(fighter.name) && fighters.findIndex(f => f.name === fighter.name) === i
  ));
  const [enabled, setEnabled] = useState({});
  const [values, setValues] = useState(() => Object.fromEntries(testable.map(f => [f.name, defaultTestForm(f.name)])));

  const toggle = name => {
    audioManager.playUiClick();
    setEnabled(current => ({ ...current, [name]: !current[name] }));
  };

  const setValue = (name, key, value) => {
    setValues(current => ({ ...current, [name]: { ...current[name], [key]: value } }));
  };

  const confirm = () => {
    audioManager.playUiClick();
    const forms = {};
    for (const fighter of testable) {
      if (enabled[fighter.name]) forms[fighter.name] = values[fighter.name];
    }
    onConfirm(forms);
  };

  const skip = () => {
    audioManager.playUiClick();
    onSkip();
  };

  return (
    <div className="fighter-info-overlay prediction-overlay" role="dialog" aria-label="Enemy forms">
      <div className="prediction-modal enemy-forms-modal">
        <header>
          <div>
            <div className="roster-eyebrow">TEST ENEMY FORMS</div>
            <h2>START SOMEONE IN A DIFFERENT FORM?</h2>
          </div>
          <button className="fighter-info-close" onClick={onCancel} aria-label="Cancel battle">×</button>
        </header>

        <p className="prediction-progress">Switch a card on to test it. Cards left off play normally.</p>

        <div className="enemy-form-list">
          {testable.map(fighter => {
            const isOn = Boolean(enabled[fighter.name]);
            return (
              <div key={fighter.name} className={`enemy-form-card${isOn ? " is-on" : ""}`} style={{ "--fighter-color": fighter.color }}>
                <button type="button" className="enemy-form-toggle" aria-pressed={isOn} onClick={() => toggle(fighter.name)}>
                  <b>{fighter.name}</b>
                  <span>{isOn ? "TESTING" : "NORMAL"}</span>
                </button>
                {isOn && TEST_FORM_CONTROLS[fighter.name].map(control => {
                  const value = values[fighter.name][control.key];
                  return (
                    <label key={control.key} className="enemy-form-control">
                      <span>{control.label}</span>
                      <b>{value}{control.unit}</b>
                      <input
                        type="range"
                        min={control.min}
                        max={control.max}
                        step={control.step}
                        value={value}
                        onChange={event => setValue(fighter.name, control.key, Number(event.target.value))}
                      />
                    </label>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="prediction-footer">
          <button type="button" className="prediction-skip-button" onClick={skip}>SKIP</button>
          <button type="button" className="prediction-skip-button" onClick={confirm}>USE THESE FORMS</button>
        </div>
        <div className="prediction-footer">
          <button type="button" className="prediction-cancel-button" onClick={onCancel}>CANCEL</button>
        </div>
      </div>
    </div>
  );
}
