// Mount everything in a DesignCanvas so the user can preview, focus and reorder.

const App = () => (
  <DesignCanvas>
    <DCSection
      id="intro"
      title="Munify · Kit WhatsApp Business"
      subtitle="Foto de perfil, portada y catálogo. Todos los archivos respetan el lenguaje del sitio (crema cálido, navy, serif italic). Tocá un artboard para verlo en pantalla completa."
    >
      <DCArtboard id="profile" label="Foto de perfil · 640×640" width={PROFILE_SIZE} height={PROFILE_SIZE}>
        <ProfilePic/>
      </DCArtboard>
      <DCArtboard id="profile-alt" label="Foto de perfil · alt (solo marca)" width={PROFILE_SIZE} height={PROFILE_SIZE}>
        <ProfilePicMarkOnly/>
      </DCArtboard>
      <DCArtboard id="cover" label="Portada / bienvenida · 1080×1080" width={CARD} height={CARD}>
        <CoverCard/>
      </DCArtboard>
    </DCSection>

    <DCSection
      id="promo"
      title="Promoción principal"
      subtitle="Esta es la imagen que va primera en el catálogo — el gancho."
    >
      <DCArtboard id="combo" label="Combo · Un mes gratis" width={CARD} height={CARD}>
        <ComboCard/>
      </DCArtboard>
    </DCSection>

    <DCSection
      id="modulos"
      title="Los 3 módulos"
      subtitle="Cada módulo como item del catálogo, link a su página del sitio."
    >
      <DCArtboard id="reclamos" label="Reclamos vecinales" width={CARD} height={CARD}>
        <ReclamosCard/>
      </DCArtboard>
      <DCArtboard id="tramites" label="Trámites municipales" width={CARD} height={CARD}>
        <TramitesCard/>
      </DCArtboard>
      <DCArtboard id="tesoreria" label="Tesorería · NUEVO" width={CARD} height={CARD}>
        <TesoreriaCard/>
      </DCArtboard>
    </DCSection>

    <DCSection
      id="diferenciador"
      title="Diferenciadores"
      subtitle="Las dos razones por las que nos eligen: validez gubernamental + soporte humano sin horarios."
    >
      <DCArtboard id="renaper" label="Validación biométrica RENAPER" width={CARD} height={CARD}>
        <RenaperCard/>
      </DCArtboard>
      <DCArtboard id="soporte" label="Soporte 24/7" width={CARD} height={CARD}>
        <SoporteCard/>
      </DCArtboard>
    </DCSection>

    <DCSection
      id="planes"
      title="Planes"
      subtitle="Tres items de catálogo, uno por plan. Express es el destacado."
    >
      <DCArtboard id="plan-estandar" label="Plan Estándar" width={CARD} height={CARD}>
        <PlanEstandarCard/>
      </DCArtboard>
      <DCArtboard id="plan-express" label="Plan Express · más elegido" width={CARD} height={CARD}>
        <PlanExpressCard/>
      </DCArtboard>
      <DCArtboard id="plan-premium" label="Plan Premium" width={CARD} height={CARD}>
        <PlanPremiumCard/>
      </DCArtboard>
    </DCSection>

    <DCSection
      id="cta"
      title="Llamado a la acción"
      subtitle="Última pieza del catálogo: pedir demo."
    >
      <DCArtboard id="demo" label="Demo autogestiva · 1 clic" width={CARD} height={CARD}>
        <DemoCard/>
      </DCArtboard>
    </DCSection>

    <DCSection
      id="banners"
      title="Portadas de Facebook · 851×315"
      subtitle="Tres alternativas para la foto de portada de tu página de Facebook. La esquina inferior-izquierda la tapa la foto de perfil en computadora, por eso lo importante va centrado o a la derecha."
    >
      <DCArtboard id="fb-editorial" label="A · Institucional (recomendado)" width={FB_W} height={FB_H}>
        <BannerEditorial/>
      </DCArtboard>
      <DCArtboard id="fb-promo" label="B · Promo navy" width={FB_W} height={FB_H}>
        <BannerPromo/>
      </DCArtboard>
      <DCArtboard id="fb-split" label="C · Titular + módulos" width={FB_W} height={FB_H}>
        <BannerSplit/>
      </DCArtboard>
    </DCSection>
  </DesignCanvas>
);

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
