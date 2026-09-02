// App entrypoint — mounts both variants inside a DesignCanvas.

const App = () => (
  <DesignCanvas>
    <DCSection
      id="tesoreria"
      title="Tesorería — propuestas de mejora"
      subtitle="Mismo backend, dos niveles de cambio. Misma marca Mandao en ambas: verde primario, Sora para montos, neutros cálidos, IA como widget integrado."
    >
      <DCArtboard
        id="variant-a"
        label="A · Pulido — misma estructura, marca + jerarquía"
        width={A_DIMS.width}
        height={A_DIMS.height}
      >
        <VariantA/>
      </DCArtboard>
      <DCArtboard
        id="variant-b"
        label="B · Agrupado por día + panel IA permanente"
        width={B_DIMS.width}
        height={B_DIMS.height}
      >
        <VariantB/>
      </DCArtboard>
    </DCSection>
  </DesignCanvas>
);

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
