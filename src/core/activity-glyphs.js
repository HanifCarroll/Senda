// BPMN glyph primitives adapted from @miragon/bpmn-cli 0.8.0 (MIT). See THIRD_PARTY_NOTICES.md.
const is = (el, type) => el?.$instanceOf?.(type);
const raw = (el, key) => el?.[key];
export function taskIcon(el, st) {
    const ink = st.stroke;
    const paper = st.fill;
    const line = (d, w = 1.2) => `<path d="${d}" fill="none" stroke="${ink}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (is(el, 'bpmn:UserTask')) {
        return `<path d="M2 18V15C2 11.5 5 10 10 10C15 10 18 11.5 18 15V18Z" fill="${paper}" stroke="${ink}" stroke-width="1.2"/><circle cx="10" cy="6" r="3.8" fill="${paper}" stroke="${ink}" stroke-width="1.2"/>` + line('M6 18V15M14 18V15');
    }
    if (is(el, 'bpmn:ManualTask')) {
        return line('M2 11C2 7.5 4 6 7 6H17a1.2 1.2 0 0 1 0 2.4H11M11 8.4H18.5a1.2 1.2 0 0 1 0 2.4H11M11 10.8H18a1.2 1.2 0 0 1 0 2.4H11M11 13.2H16.5a1.2 1.2 0 0 1 0 2.4H7C4 15.6 2 14 2 11Z');
    }
    if (is(el, 'bpmn:ServiceTask')) {
        return `<circle cx="10" cy="10" r="6.6" fill="none" stroke="${ink}" stroke-width="3" stroke-dasharray="2.59 2.59"/><circle cx="10" cy="10" r="5.2" fill="${paper}" stroke="${ink}" stroke-width="1.2"/><circle cx="10" cy="10" r="2" fill="none" stroke="${ink}" stroke-width="1.2"/>`;
    }
    if (is(el, 'bpmn:SendTask')) {
        return `<rect x="2" y="5" width="16" height="11" fill="${ink}" stroke="${ink}" stroke-width="1.2"/><path d="M2 5L10 11L18 5" fill="none" stroke="${paper}" stroke-width="1.2"/>`;
    }
    if (is(el, 'bpmn:ReceiveTask')) {
        return `<rect x="2" y="5" width="16" height="11" fill="${paper}" stroke="${ink}" stroke-width="1.2"/>` + line('M2 5L10 11L18 5');
    }
    if (is(el, 'bpmn:ScriptTask')) {
        return `<path d="M6 2H17C14 5 14 8 16 10.5C18 13 18 16 15 18H4C7 15 7 12 5 9.5C3 7 3 4 6 2Z" fill="${paper}" stroke="${ink}" stroke-width="1.2" stroke-linejoin="round"/>` + line('M7.5 6H13.5M8.5 9.5H14.5M8.5 13H14.5', 1);
    }
    if (is(el, 'bpmn:BusinessRuleTask')) {
        return `<rect x="2" y="4" width="16" height="12" fill="${paper}" stroke="${ink}" stroke-width="1.2"/><rect x="2" y="4" width="16" height="3.5" fill="${ink}"/>` + line('M2 11.5H18M7 7.5V16', 1);
    }
    return '';
}
export function activityMarkers(el, collapsedSub, st) {
    const ink = st.stroke;
    const line = (d, w = 1.5) => `<path d="${d}" fill="none" stroke="${ink}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
    const out = [];
    const loop = raw(el, 'loopCharacteristics');
    if (loop && is(loop, 'bpmn:MultiInstanceLoopCharacteristics'))
        out.push({ kind: raw(loop, 'isSequential') ? 'sequential' : 'parallel', svg: raw(loop, 'isSequential') ? line('M2 3H12M2 7H12M2 11H12', 2) : line('M3 2V12M7 2V12M11 2V12', 2) });
    else if (loop)
        out.push({ kind: 'loop', svg: line('M4.2 11.8A5.5 5.5 0 1 1 9.8 11.8') + line('M9.8 11.8L9.6 8.4M9.8 11.8L13 11') });
    if (collapsedSub)
        out.push({ kind: 'collapsed', svg: `<rect x="0.5" y="0.5" width="13" height="13" fill="none" stroke="${ink}" stroke-width="1.2"/>` + line('M3.5 7H10.5M7 3.5V10.5', 1.5) });
    if (raw(el, 'isForCompensation'))
        out.push({ kind: 'compensation', svg: `<path d="M1 7L7 2.5V11.5ZM7 7L13 2.5V11.5Z" fill="none" stroke="${ink}" stroke-width="1.2" stroke-linejoin="round"/>` });
    if (is(el, 'bpmn:AdHocSubProcess'))
        out.push({ kind: 'ad-hoc', svg: line('M1 8C3.5 4 5.5 4 7 7C8.5 10 10.5 10 13 6') });
    return out;
}
