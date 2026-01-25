-- =============================================================================
-- SEED: Asignaciones de dependencias para Chacabuco (municipio_id = 7)
-- Creado manualmente con análisis consciente de cada asignación
-- =============================================================================

-- =============================================================================
-- PASO 0: LIMPIAR TODO PARA CHACABUCO (municipio_id = 7)
-- =============================================================================

-- Primero eliminar trámites específicos asignados
DELETE FROM municipio_dependencia_tramites
WHERE municipio_dependencia_id IN (
    SELECT id FROM municipio_dependencias WHERE municipio_id = 7
);

-- Eliminar tipos de trámite asignados
DELETE FROM municipio_dependencia_tipos_tramites
WHERE municipio_dependencia_id IN (
    SELECT id FROM municipio_dependencias WHERE municipio_id = 7
);

-- Eliminar categorías asignadas
DELETE FROM municipio_dependencia_categorias
WHERE municipio_dependencia_id IN (
    SELECT id FROM municipio_dependencias WHERE municipio_id = 7
);

-- Eliminar dependencias habilitadas
DELETE FROM municipio_dependencias WHERE municipio_id = 7;

-- =============================================================================
-- Ahora crear todo desde cero
-- =============================================================================

DO $$
DECLARE
    v_municipio_id INT := 7;

    -- IDs de dependencias habilitadas (municipio_dependencias.id)
    v_md_atencion_vecino INT;
    v_md_obras_publicas INT;
    v_md_servicios_publicos INT;
    v_md_transito INT;
    v_md_seguridad INT;
    v_md_zoonosis INT;
    v_md_catastro INT;
    v_md_rentas INT;
    v_md_habilitaciones INT;
    v_md_obras_particulares INT;
    v_md_bromatologia INT;
    v_md_desarrollo_social INT;

    -- IDs de categorías
    v_cat_baches INT;
    v_cat_alumbrado INT;
    v_cat_residuos INT;
    v_cat_verdes INT;
    v_cat_senalizacion INT;
    v_cat_desagues INT;
    v_cat_veredas INT;
    v_cat_agua INT;
    v_cat_plagas INT;
    v_cat_ruidos INT;
    v_cat_animales INT;
    v_cat_otros INT;

    -- IDs de tipos de trámite
    v_tipo_obras_privadas INT;
    v_tipo_comercio INT;
    v_tipo_transito INT;
    v_tipo_rentas INT;
    v_tipo_ambiente INT;
    v_tipo_catastro INT;
    v_tipo_bromatologia INT;
    v_tipo_social INT;
    v_tipo_cementerio INT;
    v_tipo_documentacion INT;
    v_tipo_espacio_publico INT;

BEGIN
    RAISE NOTICE 'Iniciando seed para Chacabuco (municipio_id=%)', v_municipio_id;

    -- =============================================================================
    -- PASO 1: Habilitar todas las dependencias para el municipio
    -- =============================================================================
    RAISE NOTICE 'Paso 1: Habilitando dependencias...';

    INSERT INTO municipio_dependencias (municipio_id, dependencia_id, activo, orden, created_at)
    SELECT v_municipio_id, d.id, true, d.orden, NOW()
    FROM dependencias d
    WHERE d.activo = true
    AND NOT EXISTS (
        SELECT 1 FROM municipio_dependencias md
        WHERE md.municipio_id = v_municipio_id AND md.dependencia_id = d.id
    );

    -- Obtener IDs de municipio_dependencias
    SELECT id INTO v_md_atencion_vecino FROM municipio_dependencias
    WHERE municipio_id = v_municipio_id AND dependencia_id = (SELECT id FROM dependencias WHERE codigo = 'ATENCION_VECINO');

    SELECT id INTO v_md_obras_publicas FROM municipio_dependencias
    WHERE municipio_id = v_municipio_id AND dependencia_id = (SELECT id FROM dependencias WHERE codigo = 'OBRAS_PUBLICAS');

    SELECT id INTO v_md_servicios_publicos FROM municipio_dependencias
    WHERE municipio_id = v_municipio_id AND dependencia_id = (SELECT id FROM dependencias WHERE codigo = 'SERVICIOS_PUBLICOS');

    SELECT id INTO v_md_transito FROM municipio_dependencias
    WHERE municipio_id = v_municipio_id AND dependencia_id = (SELECT id FROM dependencias WHERE codigo = 'TRANSITO_VIAL');

    SELECT id INTO v_md_seguridad FROM municipio_dependencias
    WHERE municipio_id = v_municipio_id AND dependencia_id = (SELECT id FROM dependencias WHERE codigo = 'SEGURIDAD');

    SELECT id INTO v_md_zoonosis FROM municipio_dependencias
    WHERE municipio_id = v_municipio_id AND dependencia_id = (SELECT id FROM dependencias WHERE codigo = 'ZOONOSIS');

    SELECT id INTO v_md_catastro FROM municipio_dependencias
    WHERE municipio_id = v_municipio_id AND dependencia_id = (SELECT id FROM dependencias WHERE codigo = 'CATASTRO');

    SELECT id INTO v_md_rentas FROM municipio_dependencias
    WHERE municipio_id = v_municipio_id AND dependencia_id = (SELECT id FROM dependencias WHERE codigo = 'RENTAS');

    SELECT id INTO v_md_habilitaciones FROM municipio_dependencias
    WHERE municipio_id = v_municipio_id AND dependencia_id = (SELECT id FROM dependencias WHERE codigo = 'HABILITACIONES');

    SELECT id INTO v_md_obras_particulares FROM municipio_dependencias
    WHERE municipio_id = v_municipio_id AND dependencia_id = (SELECT id FROM dependencias WHERE codigo = 'OBRAS_PARTICULARES');

    SELECT id INTO v_md_bromatologia FROM municipio_dependencias
    WHERE municipio_id = v_municipio_id AND dependencia_id = (SELECT id FROM dependencias WHERE codigo = 'BROMATOLOGIA');

    SELECT id INTO v_md_desarrollo_social FROM municipio_dependencias
    WHERE municipio_id = v_municipio_id AND dependencia_id = (SELECT id FROM dependencias WHERE codigo = 'DESARROLLO_SOCIAL');

    RAISE NOTICE 'Dependencias habilitadas. IDs: atencion=%, obras=%, servicios=%, transito=%, zoonosis=%',
        v_md_atencion_vecino, v_md_obras_publicas, v_md_servicios_publicos, v_md_transito, v_md_zoonosis;

    -- =============================================================================
    -- PASO 2: Obtener IDs de categorías
    -- =============================================================================
    SELECT id INTO v_cat_baches FROM categorias WHERE nombre ILIKE '%Baches%' OR nombre ILIKE '%Calles%' LIMIT 1;
    SELECT id INTO v_cat_alumbrado FROM categorias WHERE nombre ILIKE '%Alumbrado%' LIMIT 1;
    SELECT id INTO v_cat_residuos FROM categorias WHERE nombre ILIKE '%Residuos%' OR nombre ILIKE '%Recoleccion%' LIMIT 1;
    SELECT id INTO v_cat_verdes FROM categorias WHERE nombre ILIKE '%Verde%' OR nombre ILIKE '%Espacios%' LIMIT 1;
    SELECT id INTO v_cat_senalizacion FROM categorias WHERE nombre ILIKE '%Señalizacion%' OR nombre ILIKE '%Senalizacion%' LIMIT 1;
    SELECT id INTO v_cat_desagues FROM categorias WHERE nombre ILIKE '%Desague%' OR nombre ILIKE '%Cloaca%' LIMIT 1;
    SELECT id INTO v_cat_veredas FROM categorias WHERE nombre ILIKE '%Vereda%' LIMIT 1;
    SELECT id INTO v_cat_agua FROM categorias WHERE nombre ILIKE '%Agua%' OR nombre ILIKE '%Caneria%' LIMIT 1;
    SELECT id INTO v_cat_plagas FROM categorias WHERE nombre ILIKE '%Plaga%' OR nombre ILIKE '%Fumigacion%' LIMIT 1;
    SELECT id INTO v_cat_ruidos FROM categorias WHERE nombre ILIKE '%Ruido%' LIMIT 1;
    SELECT id INTO v_cat_animales FROM categorias WHERE nombre ILIKE '%Animal%' LIMIT 1;
    SELECT id INTO v_cat_otros FROM categorias WHERE nombre ILIKE '%Otro%' LIMIT 1;

    -- =============================================================================
    -- PASO 3: Asignar categorías a dependencias (municipio_dependencia_categorias)
    -- =============================================================================
    RAISE NOTICE 'Paso 3: Asignando categorías a dependencias...';

    -- Limpiar asignaciones existentes
    DELETE FROM municipio_dependencia_categorias
    WHERE municipio_dependencia_id IN (
        SELECT id FROM municipio_dependencias WHERE municipio_id = v_municipio_id
    );

    -- Baches y Calles → Obras Públicas
    IF v_cat_baches IS NOT NULL AND v_md_obras_publicas IS NOT NULL THEN
        INSERT INTO municipio_dependencia_categorias (municipio_dependencia_id, categoria_id, activo, created_at)
        VALUES (v_md_obras_publicas, v_cat_baches, true, NOW());
    END IF;

    -- Alumbrado Público → Servicios Públicos
    IF v_cat_alumbrado IS NOT NULL AND v_md_servicios_publicos IS NOT NULL THEN
        INSERT INTO municipio_dependencia_categorias (municipio_dependencia_id, categoria_id, activo, created_at)
        VALUES (v_md_servicios_publicos, v_cat_alumbrado, true, NOW());
    END IF;

    -- Recolección de Residuos → Servicios Públicos
    IF v_cat_residuos IS NOT NULL AND v_md_servicios_publicos IS NOT NULL THEN
        INSERT INTO municipio_dependencia_categorias (municipio_dependencia_id, categoria_id, activo, created_at)
        VALUES (v_md_servicios_publicos, v_cat_residuos, true, NOW());
    END IF;

    -- Espacios Verdes → Servicios Públicos
    IF v_cat_verdes IS NOT NULL AND v_md_servicios_publicos IS NOT NULL THEN
        INSERT INTO municipio_dependencia_categorias (municipio_dependencia_id, categoria_id, activo, created_at)
        VALUES (v_md_servicios_publicos, v_cat_verdes, true, NOW());
    END IF;

    -- Señalización → Tránsito
    IF v_cat_senalizacion IS NOT NULL AND v_md_transito IS NOT NULL THEN
        INSERT INTO municipio_dependencia_categorias (municipio_dependencia_id, categoria_id, activo, created_at)
        VALUES (v_md_transito, v_cat_senalizacion, true, NOW());
    END IF;

    -- Desagües y Cloacas → Servicios Públicos
    IF v_cat_desagues IS NOT NULL AND v_md_servicios_publicos IS NOT NULL THEN
        INSERT INTO municipio_dependencia_categorias (municipio_dependencia_id, categoria_id, activo, created_at)
        VALUES (v_md_servicios_publicos, v_cat_desagues, true, NOW());
    END IF;

    -- Veredas → Obras Públicas
    IF v_cat_veredas IS NOT NULL AND v_md_obras_publicas IS NOT NULL THEN
        INSERT INTO municipio_dependencia_categorias (municipio_dependencia_id, categoria_id, activo, created_at)
        VALUES (v_md_obras_publicas, v_cat_veredas, true, NOW());
    END IF;

    -- Agua y Cañerías → Servicios Públicos
    IF v_cat_agua IS NOT NULL AND v_md_servicios_publicos IS NOT NULL THEN
        INSERT INTO municipio_dependencia_categorias (municipio_dependencia_id, categoria_id, activo, created_at)
        VALUES (v_md_servicios_publicos, v_cat_agua, true, NOW());
    END IF;

    -- Plagas y Fumigación → Servicios Públicos
    IF v_cat_plagas IS NOT NULL AND v_md_servicios_publicos IS NOT NULL THEN
        INSERT INTO municipio_dependencia_categorias (municipio_dependencia_id, categoria_id, activo, created_at)
        VALUES (v_md_servicios_publicos, v_cat_plagas, true, NOW());
    END IF;

    -- Ruidos Molestos → Servicios Públicos
    IF v_cat_ruidos IS NOT NULL AND v_md_servicios_publicos IS NOT NULL THEN
        INSERT INTO municipio_dependencia_categorias (municipio_dependencia_id, categoria_id, activo, created_at)
        VALUES (v_md_servicios_publicos, v_cat_ruidos, true, NOW());
    END IF;

    -- Animales Sueltos → Zoonosis
    IF v_cat_animales IS NOT NULL AND v_md_zoonosis IS NOT NULL THEN
        INSERT INTO municipio_dependencia_categorias (municipio_dependencia_id, categoria_id, activo, created_at)
        VALUES (v_md_zoonosis, v_cat_animales, true, NOW());
    END IF;

    -- Otros → Atención al Vecino
    IF v_cat_otros IS NOT NULL AND v_md_atencion_vecino IS NOT NULL THEN
        INSERT INTO municipio_dependencia_categorias (municipio_dependencia_id, categoria_id, activo, created_at)
        VALUES (v_md_atencion_vecino, v_cat_otros, true, NOW());
    END IF;

    -- =============================================================================
    -- PASO 4: Obtener IDs de tipos de trámite
    -- =============================================================================
    SELECT id INTO v_tipo_obras_privadas FROM tipos_tramite WHERE codigo = 'OBRAS_PRIVADAS' OR nombre ILIKE '%Obras Privadas%' LIMIT 1;
    SELECT id INTO v_tipo_comercio FROM tipos_tramite WHERE codigo = 'COMERCIO_INDUSTRIA' OR nombre ILIKE '%Comercio%' LIMIT 1;
    SELECT id INTO v_tipo_transito FROM tipos_tramite WHERE codigo = 'TRANSITO_TRANSPORTE' OR nombre ILIKE '%Tránsito%' OR nombre ILIKE '%Transito%' LIMIT 1;
    SELECT id INTO v_tipo_rentas FROM tipos_tramite WHERE codigo = 'RENTAS_TASAS' OR nombre ILIKE '%Rentas%' LIMIT 1;
    SELECT id INTO v_tipo_ambiente FROM tipos_tramite WHERE codigo = 'MEDIO_AMBIENTE' OR nombre ILIKE '%Ambiente%' LIMIT 1;
    SELECT id INTO v_tipo_catastro FROM tipos_tramite WHERE codigo = 'CATASTRO' OR nombre ILIKE '%Catastro%' LIMIT 1;
    SELECT id INTO v_tipo_bromatologia FROM tipos_tramite WHERE codigo = 'SALUD_BROMATOLOGIA' OR nombre ILIKE '%Bromatolog%' LIMIT 1;
    SELECT id INTO v_tipo_social FROM tipos_tramite WHERE codigo = 'DESARROLLO_SOCIAL' OR nombre ILIKE '%Social%' LIMIT 1;
    SELECT id INTO v_tipo_cementerio FROM tipos_tramite WHERE codigo = 'CEMENTERIO' OR nombre ILIKE '%Cementerio%' LIMIT 1;
    SELECT id INTO v_tipo_documentacion FROM tipos_tramite WHERE codigo = 'DOCUMENTACION' OR nombre ILIKE '%Documentación%' OR nombre ILIKE '%Documentacion%' LIMIT 1;
    SELECT id INTO v_tipo_espacio_publico FROM tipos_tramite WHERE codigo = 'ESPACIO_PUBLICO' OR nombre ILIKE '%Espacio Público%' OR nombre ILIKE '%Espacio Publico%' LIMIT 1;

    -- =============================================================================
    -- PASO 5: Asignar tipos de trámite a dependencias (municipio_dependencia_tipos_tramites)
    -- =============================================================================
    RAISE NOTICE 'Paso 5: Asignando tipos de trámite a dependencias...';

    -- Limpiar asignaciones existentes
    DELETE FROM municipio_dependencia_tipos_tramites
    WHERE municipio_dependencia_id IN (
        SELECT id FROM municipio_dependencias WHERE municipio_id = v_municipio_id
    );

    -- Obras Privadas → Obras Particulares
    IF v_tipo_obras_privadas IS NOT NULL AND v_md_obras_particulares IS NOT NULL THEN
        INSERT INTO municipio_dependencia_tipos_tramites (municipio_dependencia_id, tipo_tramite_id, activo, created_at)
        VALUES (v_md_obras_particulares, v_tipo_obras_privadas, true, NOW());
    END IF;

    -- Comercio e Industria → Habilitaciones
    IF v_tipo_comercio IS NOT NULL AND v_md_habilitaciones IS NOT NULL THEN
        INSERT INTO municipio_dependencia_tipos_tramites (municipio_dependencia_id, tipo_tramite_id, activo, created_at)
        VALUES (v_md_habilitaciones, v_tipo_comercio, true, NOW());
    END IF;

    -- Tránsito y Transporte → Tránsito
    IF v_tipo_transito IS NOT NULL AND v_md_transito IS NOT NULL THEN
        INSERT INTO municipio_dependencia_tipos_tramites (municipio_dependencia_id, tipo_tramite_id, activo, created_at)
        VALUES (v_md_transito, v_tipo_transito, true, NOW());
    END IF;

    -- Rentas y Tasas → Rentas
    IF v_tipo_rentas IS NOT NULL AND v_md_rentas IS NOT NULL THEN
        INSERT INTO municipio_dependencia_tipos_tramites (municipio_dependencia_id, tipo_tramite_id, activo, created_at)
        VALUES (v_md_rentas, v_tipo_rentas, true, NOW());
    END IF;

    -- Medio Ambiente → Servicios Públicos
    IF v_tipo_ambiente IS NOT NULL AND v_md_servicios_publicos IS NOT NULL THEN
        INSERT INTO municipio_dependencia_tipos_tramites (municipio_dependencia_id, tipo_tramite_id, activo, created_at)
        VALUES (v_md_servicios_publicos, v_tipo_ambiente, true, NOW());
    END IF;

    -- Catastro e Inmuebles → Catastro
    IF v_tipo_catastro IS NOT NULL AND v_md_catastro IS NOT NULL THEN
        INSERT INTO municipio_dependencia_tipos_tramites (municipio_dependencia_id, tipo_tramite_id, activo, created_at)
        VALUES (v_md_catastro, v_tipo_catastro, true, NOW());
    END IF;

    -- Salud y Bromatología → Bromatología
    IF v_tipo_bromatologia IS NOT NULL AND v_md_bromatologia IS NOT NULL THEN
        INSERT INTO municipio_dependencia_tipos_tramites (municipio_dependencia_id, tipo_tramite_id, activo, created_at)
        VALUES (v_md_bromatologia, v_tipo_bromatologia, true, NOW());
    END IF;

    -- Desarrollo Social → Desarrollo Social
    IF v_tipo_social IS NOT NULL AND v_md_desarrollo_social IS NOT NULL THEN
        INSERT INTO municipio_dependencia_tipos_tramites (municipio_dependencia_id, tipo_tramite_id, activo, created_at)
        VALUES (v_md_desarrollo_social, v_tipo_social, true, NOW());
    END IF;

    -- Cementerio → Atención al Vecino (no hay dependencia específica)
    IF v_tipo_cementerio IS NOT NULL AND v_md_atencion_vecino IS NOT NULL THEN
        INSERT INTO municipio_dependencia_tipos_tramites (municipio_dependencia_id, tipo_tramite_id, activo, created_at)
        VALUES (v_md_atencion_vecino, v_tipo_cementerio, true, NOW());
    END IF;

    -- Documentación Personal → Atención al Vecino
    IF v_tipo_documentacion IS NOT NULL AND v_md_atencion_vecino IS NOT NULL THEN
        INSERT INTO municipio_dependencia_tipos_tramites (municipio_dependencia_id, tipo_tramite_id, activo, created_at)
        VALUES (v_md_atencion_vecino, v_tipo_documentacion, true, NOW());
    END IF;

    -- Espacio Público → Habilitaciones
    IF v_tipo_espacio_publico IS NOT NULL AND v_md_habilitaciones IS NOT NULL THEN
        INSERT INTO municipio_dependencia_tipos_tramites (municipio_dependencia_id, tipo_tramite_id, activo, created_at)
        VALUES (v_md_habilitaciones, v_tipo_espacio_publico, true, NOW());
    END IF;

    -- =============================================================================
    -- PASO 6: Asignar TODOS los trámites específicos (municipio_dependencia_tramites)
    -- =============================================================================
    RAISE NOTICE 'Paso 6: Asignando trámites específicos...';

    -- Limpiar asignaciones existentes
    DELETE FROM municipio_dependencia_tramites
    WHERE municipio_dependencia_id IN (
        SELECT id FROM municipio_dependencias WHERE municipio_id = v_municipio_id
    );

    -- Obras Privadas (4 trámites) → Obras Particulares
    IF v_md_obras_particulares IS NOT NULL THEN
        INSERT INTO municipio_dependencia_tramites (municipio_dependencia_id, tramite_id, activo, created_at)
        SELECT v_md_obras_particulares, t.id, true, NOW()
        FROM tramites t
        WHERE t.tipo_tramite_id = v_tipo_obras_privadas AND t.activo = true;
    END IF;

    -- Comercio e Industria (4 trámites) → Habilitaciones
    IF v_md_habilitaciones IS NOT NULL THEN
        INSERT INTO municipio_dependencia_tramites (municipio_dependencia_id, tramite_id, activo, created_at)
        SELECT v_md_habilitaciones, t.id, true, NOW()
        FROM tramites t
        WHERE t.tipo_tramite_id = v_tipo_comercio AND t.activo = true;
    END IF;

    -- Tránsito y Transporte (3 trámites) → Tránsito
    IF v_md_transito IS NOT NULL THEN
        INSERT INTO municipio_dependencia_tramites (municipio_dependencia_id, tramite_id, activo, created_at)
        SELECT v_md_transito, t.id, true, NOW()
        FROM tramites t
        WHERE t.tipo_tramite_id = v_tipo_transito AND t.activo = true;
    END IF;

    -- Rentas y Tasas (3 trámites) → Rentas
    IF v_md_rentas IS NOT NULL THEN
        INSERT INTO municipio_dependencia_tramites (municipio_dependencia_id, tramite_id, activo, created_at)
        SELECT v_md_rentas, t.id, true, NOW()
        FROM tramites t
        WHERE t.tipo_tramite_id = v_tipo_rentas AND t.activo = true;
    END IF;

    -- Medio Ambiente (2 trámites) → Servicios Públicos
    IF v_md_servicios_publicos IS NOT NULL THEN
        INSERT INTO municipio_dependencia_tramites (municipio_dependencia_id, tramite_id, activo, created_at)
        SELECT v_md_servicios_publicos, t.id, true, NOW()
        FROM tramites t
        WHERE t.tipo_tramite_id = v_tipo_ambiente AND t.activo = true;
    END IF;

    -- Catastro e Inmuebles (3 trámites) → Catastro
    IF v_md_catastro IS NOT NULL THEN
        INSERT INTO municipio_dependencia_tramites (municipio_dependencia_id, tramite_id, activo, created_at)
        SELECT v_md_catastro, t.id, true, NOW()
        FROM tramites t
        WHERE t.tipo_tramite_id = v_tipo_catastro AND t.activo = true;
    END IF;

    -- Salud y Bromatología (2 trámites) → Bromatología
    IF v_md_bromatologia IS NOT NULL THEN
        INSERT INTO municipio_dependencia_tramites (municipio_dependencia_id, tramite_id, activo, created_at)
        SELECT v_md_bromatologia, t.id, true, NOW()
        FROM tramites t
        WHERE t.tipo_tramite_id = v_tipo_bromatologia AND t.activo = true;
    END IF;

    -- Desarrollo Social (5 trámites) → Desarrollo Social
    IF v_md_desarrollo_social IS NOT NULL THEN
        INSERT INTO municipio_dependencia_tramites (municipio_dependencia_id, tramite_id, activo, created_at)
        SELECT v_md_desarrollo_social, t.id, true, NOW()
        FROM tramites t
        WHERE t.tipo_tramite_id = v_tipo_social AND t.activo = true;
    END IF;

    -- Cementerio (5 trámites) → Atención al Vecino
    IF v_md_atencion_vecino IS NOT NULL THEN
        INSERT INTO municipio_dependencia_tramites (municipio_dependencia_id, tramite_id, activo, created_at)
        SELECT v_md_atencion_vecino, t.id, true, NOW()
        FROM tramites t
        WHERE t.tipo_tramite_id = v_tipo_cementerio AND t.activo = true;
    END IF;

    -- Documentación Personal (2 trámites) → Atención al Vecino
    IF v_md_atencion_vecino IS NOT NULL THEN
        INSERT INTO municipio_dependencia_tramites (municipio_dependencia_id, tramite_id, activo, created_at)
        SELECT v_md_atencion_vecino, t.id, true, NOW()
        FROM tramites t
        WHERE t.tipo_tramite_id = v_tipo_documentacion AND t.activo = true
        ON CONFLICT DO NOTHING;
    END IF;

    -- Espacio Público (5 trámites) → Habilitaciones
    IF v_md_habilitaciones IS NOT NULL THEN
        INSERT INTO municipio_dependencia_tramites (municipio_dependencia_id, tramite_id, activo, created_at)
        SELECT v_md_habilitaciones, t.id, true, NOW()
        FROM tramites t
        WHERE t.tipo_tramite_id = v_tipo_espacio_publico AND t.activo = true
        ON CONFLICT DO NOTHING;
    END IF;

    -- =============================================================================
    -- RESUMEN
    -- =============================================================================
    RAISE NOTICE '=== SEED COMPLETADO PARA CHACABUCO ===';
    RAISE NOTICE 'Dependencias habilitadas: %', (SELECT COUNT(*) FROM municipio_dependencias WHERE municipio_id = v_municipio_id);
    RAISE NOTICE 'Categorías asignadas: %', (SELECT COUNT(*) FROM municipio_dependencia_categorias mdc JOIN municipio_dependencias md ON mdc.municipio_dependencia_id = md.id WHERE md.municipio_id = v_municipio_id);
    RAISE NOTICE 'Tipos trámite asignados: %', (SELECT COUNT(*) FROM municipio_dependencia_tipos_tramites mdtt JOIN municipio_dependencias md ON mdtt.municipio_dependencia_id = md.id WHERE md.municipio_id = v_municipio_id);
    RAISE NOTICE 'Trámites específicos asignados: %', (SELECT COUNT(*) FROM municipio_dependencia_tramites mdt JOIN municipio_dependencias md ON mdt.municipio_dependencia_id = md.id WHERE md.municipio_id = v_municipio_id);

END $$;
