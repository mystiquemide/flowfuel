export default function Home() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "96px 24px",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.75rem",
          letterSpacing: "0.045em",
          color: "var(--fuel)",
          marginBottom: 24,
        }}
      >
        FLOWFUEL
      </p>
      <h1
        style={{
          fontSize: "clamp(2.25rem, 6vw, 3.5rem)",
          fontWeight: 600,
          lineHeight: 1.02,
          letterSpacing: "-0.045em",
          margin: "0 0 24px",
        }}
      >
        Your workflow.
        <br />
        Their inference bill.
      </h1>
      <p
        style={{
          color: "var(--ink-muted)",
          fontSize: "1rem",
          lineHeight: 1.55,
          maxWidth: 480,
          margin: "0 0 40px",
        }}
      >
        Run client automations without sharing a master model account or
        fronting every token.
      </p>
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.875rem",
          color: "var(--ink)",
          borderLeft: "2px solid var(--fuel)",
          paddingLeft: 16,
          margin: 0,
        }}
      >
        Every client runs against their own isolated Orbio balance.
      </p>
    </main>
  );
}
