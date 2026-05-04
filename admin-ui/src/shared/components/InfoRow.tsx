export function InfoRow(props: { label: string; value: string; code?: boolean }) {
  return (
    <div className="service-row">
      <label>{props.label}</label>
      {props.code ? <code>{props.value}</code> : <strong>{props.value}</strong>}
    </div>
  );
}
