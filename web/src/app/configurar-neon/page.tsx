export default function ConfigureNeonPage() {
  return (
    <main className="auth-shell">
      <section className="auth-card setup-card">
        <LinkBrand />
        <p className="auth-kicker">CONFIGURAÇÃO INICIAL</p>
        <h1>Conecte seu projeto Neon</h1>
        <p className="auth-description">
          Para abrir o sistema, configure a conexão do banco e a URL do Neon Auth
          no arquivo <code>web/.env.local</code>. Os nomes das variáveis estão
          em <code>web/.env.example</code>.
        </p>
        <ol className="setup-list">
          <li>Crie um projeto Neon em uma região compatível com Neon Auth.</li>
          <li>Ative Neon Auth e copie a URL de autenticação.</li>
          <li>Copie a connection string do banco para <code>DATABASE_URL</code>.</li>
          <li>Gere um segredo aleatório de pelo menos 32 caracteres para os cookies.</li>
        </ol>
        <p className="setup-footnote">
          Não publique a connection string nem o segredo dos cookies no GitHub.
        </p>
      </section>
    </main>
  );
}

function LinkBrand() {
  return (
    <div className="brand auth-brand" aria-label="Avalia">
      <span className="brand-symbol">a</span>
      <span className="brand-name">avalia<span>.</span></span>
    </div>
  );
}
