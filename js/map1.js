// Configuration des données

const DATA_URL1 = "data/ada_2018.geojson"; // DATA_URL1: Chemin GeoJSON pour la couche Aire de Division Agrégée ADA
const DATA_URL2 = "data/ad_2018.geojson"; // DATA_URL2: Chemin GeoJSON pour la couche Aire de Division AD 
const DATA_URL3 = "data/address_vegetation2018.geojson"; // DATA_URL3: Chemin GeoJSON pour les points adresses et % de végétation
const DATA_URL4 = "data/mortality_2018_2095.geojson"; // DATA_URL4: Chemin GeoJSON pour les scénarios et statistiques de mortalité

// Seuils de zoom pour basculer entre les couches
/**ZOOM_THRESHOLD: Seuil de zoom à partir duquel on passe d'ADA à AD. */
const ZOOM_THRESHOLD = 12.2; // À partir de ce niveau, on affiche ad_2018
/**ZOOM_VEGETATION: Seuil de zoom à partir duquel on affiche la couche Végétation */
const ZOOM_VEGETATION = 14.5; // À partir de ce niveau, on affiche la végétation

/**LEVEL_COLORS: Palette de couleurs par niveau de vulnérabilité */
const LEVEL_COLORS = {
  low:      "#22c55e",   // vert-500   – faible
  average:  "#eab308",   // ambre-500  – moyen  (remplace le vert-lime pâle illisible)
  high:     "#f97316",   // orange-500 – élevé
  veryHigh: "#ff0404"    // rouge-600  – très élevé
};

// Classification de végétation avec couleurs
/**VEGETATION_CLASSES: Classes d'intervalles pour le pourcentage de végétation */
const VEGETATION_CLASSES = {
  "0-15": { color: "#8B4513", label: "0-15%" },    // Brun (peu de végétation)
  "15-30": { color: "#FFA500", label: "15-30%" },  // Orange
  "30-50": { color: "#FFFF00", label: "30-50%" },  // Jaune
  "50-75": { color: "#90EE90", label: "50-75%" },  // Vert clair
  "75-100": { color: "#006400", label: "75-100%" } // Vert foncé
};

/** FR_TO_EN: Mapping des libellés FR vers EN pour les niveaux de vulnérabilité */
const FR_TO_EN = {
  "faible":"low","moyen":"average","eleve":"high","très élevé":"veryHigh"
};

// Légendes actives selon le mode d'affichage
let activeLevels = new Set(["low","average","high","veryHigh"]); //activeLevels: Ensemble des niveaux de vulnérabilité cochés dans la légende
let activeVegetationClasses = new Set(["0-15", "15-30", "30-50", "50-75", "75-100"]); //activeVegetationClasses: Ensemble des classes de végétation cochées dans la légende
// currentLegendMode: Mode de légende courant (vulnerability / vegetation / combined).
let currentLegendMode = 'vulnerability'; // 'vulnerability', 'vegetation' ou 'combined'

// Variables pour le clignotement
let blinkTimer = null;
let isBlinkVisible = true;

/**
 * countUp — anime un élément de son ancienne valeur vers targetValue.
 * @param {HTMLElement} el        – élément cible
 * @param {number}      target    – valeur finale
 * @param {Object}      opts
 *   duration   {number}   ms d'animation (défaut 600)
 *   decimals   {number}   décimales pour les % (défaut 0)
 *   suffix     {string}   suffixe ajouté après la valeur (défaut '')
 *   locale     {string}   locale pour toLocaleString (défaut 'fr-CA')
 */
function countUp(el, target, { duration = 600, decimals = 0, suffix = '', locale = 'fr-CA' } = {}) {
  if (!el) return;

  // Lire l'ancienne valeur numérique depuis le contenu actuel
  const rawPrev = parseFloat((el.textContent || '0').replace(/\s/g, '').replace(',', '.')) || 0;
  const start = isNaN(rawPrev) ? 0 : rawPrev;
  const startTime = performance.now();

  // Easing cubic out
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const value = start + (target - start) * easeOut(progress);

    if (decimals > 0) {
      el.textContent = value.toFixed(decimals) + suffix;
    } else {
      el.textContent = Math.round(value).toLocaleString(locale) + suffix;
    }

    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}
// Mémorise le dernier code postal recherché (ex.: "H2X1A1")
let lastSearchedPostalCode = null;

// Variable globale pour l'instance du graphique
let socioEconomicChart = null;

// Fonction pour initialiser le graphique socio-économique
function initSocioEconomicChart() {
  const chartDom = document.getElementById('soc-eco-chart');
  if (!chartDom) {
    console.error('Element soc-eco-chart non trouvé');
    return;
  }

  // Créer une nouvelle instance
  socioEconomicChart = echarts.init(chartDom);
  
  // Afficher la moyenne de la couche active au démarrage
  setTimeout(() => { 
    resetSocioEconomicChart(); // Utilise la même logique que les stats de population
  }, 100);
}

/** Réinitialise le graphique avec les moyennes de la couche active (équivalent à resetPopulationStats) */
function resetSocioEconomicChart() {
  if (!socioEconomicChart) {
    console.error('socioEconomicChart n\'est pas initialisé');
    return;
  }
  updateChartWithLayerAverages();
}

/** Met à jour le graphique socio-économique avec la feature sélectionnée (équivalent à updatePopulationStats) */
function updateSocioEconomicChart(feature) {
  // Chart not yet initialized — skip silently
  if (!socioEconomicChart) return;
  // Si aucune feature n'est sélectionnée, revenir aux moyennes
  if (!feature) {
    resetSocioEconomicChart();
    return;
  }

  console.log('Mise à jour du graphique avec:', feature);
  const properties = feature.getProperties ? feature.getProperties() : feature;
  
  // Valeurs absolues (barres)
  const age65    = Number(properties.age_over_65    || 0);
  const age75    = Number(properties.age_over_75    || 0);
  const age85    = Number(properties.age_over_85    || 0);
  const popLico  = Number(properties.pop_lico_at    || 0);
  const popNoDeg = Number(properties.pop_no_degree  || 0);

  // Pourcentages déjà prêts dans les données
  // Si tes % sont sur [0..1], décommente la ligne "* 100".
  const age65Pct = Number(properties.age_over_65_pct    ?? 0); // * 100;
  const age75Pct = Number(properties.age_over_75_pct    ?? 0); // * 100;
  const age85Pct = Number(properties.age_over_85_pct    ?? 0); // * 100;
  const licoPct  = Number(properties.pop_lico_at_pct    ?? 0); // * 100;
  const noDegPct = Number(properties.pop_no_degree_pct  ?? 0); // * 100;

  // Configuration du graphique (conserve l'animation)
  const theme = getChartTheme();
  const option = {
    title: { show: false },
    animation: true,
    animationDuration: 750,
    grid: {
      left: '1%',
      right: '1%',
      bottom: '1%',
      top: '5%',
      containLabel: true
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: function(params) {
        const d = params && params[0];
        if (!d) return '';
        const t = TRANSLATIONS[currentLang] || TRANSLATIONS['fr'];
        const tooltipKeys = [
          'chart-65-tooltip',
          'chart-75-tooltip',
          'chart-85-tooltip',
          'chart-lico-tooltip',
          'chart-nodeg-tooltip'
        ];
        const pct = (d.data && typeof d.data.percentage === 'number')
          ? d.data.percentage.toFixed(1)
          : '0.0';
        const seriesName = t[tooltipKeys[d.dataIndex]] || d.name;
        const numLabel  = t['chart-count-label'];
        const pctLabel  = t['chart-pct-label'];
        return `<b>${seriesName}</b><br/>${numLabel}: ${(+d.value).toLocaleString('fr-CA')}<br/>${pctLabel}: ${pct}%`;
      }
    },
    xAxis: {
      type: 'category',
      data: ['65 ans+', '75 ans+', '85 ans+', 'Faible\nrevenu', 'Sans\ndiplôme'],
      axisLabel: {
        rotate: 45,
        fontSize: 10,
        interval: 0,
        margin: 8,
        textStyle: { color: theme.textColor }
      },
      axisTick: { alignWithLabel: true }
    },
    yAxis: {
      type: 'value',
      axisLabel: { fontSize: 9, color: theme.textColor }
    },
    series: [{
      type: 'bar',
      barWidth: '60%',
      // ✅ on passe value + percentage, pour que label/tooltip affichent le % fourni
      data: [
        { name: '65 ans+',        value: age65,    percentage: age65Pct, itemStyle: { color: '#0dcaf0'    } },
        { name: '75 ans+',        value: age75,    percentage: age75Pct, itemStyle: { color: '#0993FF'    } },
        { name: '85 ans+',        value: age85,    percentage: age85Pct, itemStyle: { color: '#9c628eff'  } },
        { name: 'Faible\nrevenu', value: popLico,  percentage: licoPct,  itemStyle: { color: '#ffc107'    } },
        { name: 'Sans\ndiplôme',  value: popNoDeg, percentage: noDegPct, itemStyle: { color: '#dc3545'    } }
      ],
      label: {
        show: true,
        position: 'top',
        formatter: (p) => {
          const pct = (p.data && p.data.percentage != null) ? Number(p.data.percentage) : 0;
          return `${pct.toFixed(1)}%`;   // 1 décimale comme le tooltip
        },
        fontSize: 8,
        color: theme.textColor
      }

    }]
  };

  // merge=false pour préserver l'animation au refresh
  socioEconomicChart.setOption(option, false);
}


// Mettre à jour le graphique avec les moyennes de la couche active
function updateChartWithLayerAverages() {
  if (!socioEconomicChart) return;
  const averages = getAverageKpiData();
  console.log('Mise à jour du graphique avec les moyennes de la couche active:', averages);
  updateSocioEconomicChart({
    pop_tot: averages.avgPop,
    age_over_65: averages.avgAge65,
    age_over_75: averages.avgAge75,
    age_over_85: averages.avgAge85,
    pop_lico_at: averages.avgPopLico,
    pop_no_degree: averages.avgPopNoDegree,
    // Ajout des champs de pourcentage
    age_over_65_pct: averages.avgAge65Pct,
    age_over_75_pct: averages.avgAge75Pct,
    age_over_85_pct: averages.avgAge85Pct,
    pop_lico_at_pct: averages.avgPopLicoPct,
    pop_no_degree_pct: averages.avgPopNoDegreePct
  });
}

// Initialisation au chargement
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(() => {
    initSocioEconomicChart();
  }, 1000);
});


// ===============================
// Rendre un popup (ol.Overlay) déplaçable
// ===============================
function enablePopupDrag(overlay, map, handleSelector = '.popup-header') {
  const container = overlay.getElement();
  if (!container) return;

  const handle = container.querySelector(handleSelector) || container;
  const viewport = map.getViewport();

  let dragging = false;
  let startPixel = null;
  let startOverlayPixel = null;
  let dragPan = null;
  let dragPanWasActive = true;

  function getViewportPixel(evt) {
    const rect = viewport.getBoundingClientRect();
    const p = (evt.touches && evt.touches[0]) || evt;
    return [p.clientX - rect.left, p.clientY - rect.top];
  }
  function ensureDragPan() {
    if (!dragPan) {
      dragPan = map.getInteractions().getArray().find(i => i instanceof ol.interaction.DragPan);
    }
    return dragPan;
  }
  function setDragPanActive(active) {
    const dp = ensureDragPan();
    if (dp) dp.setActive(active);
  }

  function onPointerDown(evt) {
    if (evt.button !== undefined && evt.button !== 0) return;
    const pos = overlay.getPosition();
    if (!pos) return;

    dragging = true;
    startPixel = getViewportPixel(evt);
    startOverlayPixel = map.getPixelFromCoordinate(pos);

    const dp = ensureDragPan();
    dragPanWasActive = dp ? dp.getActive() : true;
    setDragPanActive(false);

    viewport.style.cursor = 'grabbing';
    evt.preventDefault();
    evt.stopPropagation();

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp, { passive: false });
    window.addEventListener('touchmove', onPointerMove, { passive: false });
    window.addEventListener('touchend', onPointerUp, { passive: false });
  }
  function onPointerMove(evt) {
    if (!dragging) return;
    const curr = getViewportPixel(evt);
    const dx = curr[0] - startPixel[0];
    const dy = curr[1] - startPixel[1];
    const newPixel = [ startOverlayPixel[0] + dx, startOverlayPixel[1] + dy ];
    const newCoord = map.getCoordinateFromPixel(newPixel);
    overlay.setPosition(newCoord);
    evt.preventDefault();
    evt.stopPropagation();
  }
  function onPointerUp(evt) {
    if (!dragging) return;
    dragging = false;
    setDragPanActive(dragPanWasActive);
    viewport.style.cursor = '';
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('touchmove', onPointerMove);
    window.removeEventListener('touchend', onPointerUp);
    evt.preventDefault();
    evt.stopPropagation();
  }

  handle.style.touchAction = 'none';
  handle.style.userSelect = 'none';
  handle.addEventListener('pointerdown', onPointerDown, { passive: false });
  handle.addEventListener('touchstart', onPointerDown, { passive: false });
}

// Fonction de jointure par attributs (simple et efficace)
// Trouver la zone AD/ADA correspondante par jointure sur les IDs
//findContainingFeatureByJoin: Jointure attributaire pour rattacher un point à son AD/ADA.
function findContainingFeatureByJoin(vegetationFeature) {
  const dauid = vegetationFeature.get('dauid');   // Code AD
  const adauid = vegetationFeature.get('adauid'); // Code ADA
  
  console.log('=== DÉBUT JOINTURE ===');
  console.log('Feature végétation - Code postal:', vegetationFeature.get('postal_code'));
  console.log('Feature végétation - DAUID:', dauid);
  console.log('Feature végétation - ADAUID:', adauid);
  
  // 1. Chercher d'abord dans les données AD (plus précises)
  if (dauid && adData) {
    console.log('Recherche dans adData avec dauid:', dauid);
    const matchingAD = adData.find(feature => 
      feature.get('dauid') === dauid
    );
    
    if (matchingAD) {
      console.log('✅ Zone AD trouvée par jointure:', dauid);
      console.log('Zone AD - Code postal:', matchingAD.get('postal_code'));
      console.log('Zone AD - Propriétés:', matchingAD.getProperties());
      return matchingAD;
    } else {
      console.log('❌ Aucune zone AD trouvée pour dauid:', dauid);
    }
  }
  
  // 2. Si pas trouvé dans AD, chercher dans ADA (fallback)
  if (adauid && adaData) {
    console.log('Recherche dans adaData avec adauid:', adauid);
    const matchingADA = adaData.find(feature => 
      feature.get('adauid') === adauid
    );
    
    if (matchingADA) {
      console.log('✅ Zone ADA trouvée par jointure:', adauid);
      console.log('Zone ADA - Code postal:', matchingADA.get('postal_code'));
      console.log('Zone ADA - Propriétés:', matchingADA.getProperties());
      return matchingADA;
    } else {
      console.log('❌ Aucune zone ADA trouvée pour adauid:', adauid);
    }
  }
  
  console.log('❌ Aucune zone trouvée pour dauid:', dauid, 'adauid:', adauid);
  console.log('=== FIN JOINTURE ===');
  return null;
}

// Mettre à jour les KPI avec jointure par attributs
//updateKpisWithJoin: Met à jour les KPI; fait une jointure si la feature vient de la végétation.

function updateKpisWithJoin(clickedFeature, layerType) {
  let featureForKpis = clickedFeature;
  
  if (layerType === 'vegetation') {
    const matchingFeature = findContainingFeatureByJoin(clickedFeature);
    featureForKpis = matchingFeature ? matchingFeature : null;
  }
  
  // Mettre à jour tous les KPIs existants
  updateKpiPopLico(featureForKpis);
  updateKpiPopNoDegree(featureForKpis);
  updateKpiHouseholdRenter(featureForKpis);
  updateKpiHouseholdOnePerson(featureForKpis);
  updatePopulationStats(featureForKpis);
  updateSocioEconomicChart(featureForKpis);
  updateKpiGaugesWithFeature(featureForKpis);

  return featureForKpis;
}

// KPI - Population à faible revenu (simple)
let currentSelectedFeature = null;
//updateKpiPopLico: Met à jour le KPI: Population à faible revenu.

function updateKpiPopLico(feature) {
  const kpiValue = document.getElementById('kpi-pop-lico-value');
  const kpiPop = document.getElementById('kpi-pop-total');
  const kpiPct = document.getElementById('kpi-pop-lico-pct');
  
  if (!feature || !kpiValue || !kpiPop || !kpiPct) {
    // Réinitialiser si pas de feature sélectionnée
    if (kpiValue) kpiValue.textContent = '--';
    if (kpiPop) kpiPop.textContent = '--';
    if (kpiPct) kpiPct.textContent = '-- %';
    return;
  }
  
  const properties = feature.getProperties();
  const popLico = properties.pop_lico_at;
  const popTotal = properties.pop_tot;
  const popLicoPct = properties.pop_lico_at_pct;
  
  // Animation de mise à jour
  kpiValue.classList.add('kpi-value-updating');
  kpiPop.classList.add('kpi-value-updating');
  kpiPct.classList.add('kpi-value-updating');
  
  setTimeout(() => {
    // Mettre à jour les valeurs
    if (popLico !== undefined && popLico !== null) {
      countUp(kpiValue, Number(popLico));
    } else {
      kpiValue.textContent = 'N/D';
    }
    if (popTotal !== undefined && popTotal !== null) {
      countUp(kpiPop, Number(popTotal));
    } else {
      kpiPop.textContent = 'N/D';
    }

    if (popLicoPct !== undefined && popLicoPct !== null) {
      countUp(kpiPct, Number(popLicoPct), { decimals: 1, suffix: ' %' });
      
      // Changer la couleur selon le pourcentage
      if (popLicoPct > 20) {
        kpiValue.style.color = 'var(--bs-danger)';
        kpiPct.style.color = 'var(--bs-danger)';
      } else if (popLicoPct > 10) {
        kpiValue.style.color = 'var(--bs-warning)';
        kpiPct.style.color = 'var(--bs-warning)';
      } else {
        kpiValue.style.color = 'var(--bs-primary)';
        kpiPct.style.color = 'var(--bs-primary)';
      }
    } else {
      kpiPct.textContent = 'N/D %';
      kpiPct.style.color = 'var(--bs-secondary)';
    }
    
    // Retirer les classes d'animation
    setTimeout(() => {
      kpiValue.classList.remove('kpi-value-updating');
      kpiPop.classList.remove('kpi-value-updating');
      kpiPct.classList.remove('kpi-value-updating');
    }, 300);
  }, 200);
}

// Mettre à jour le KPI Population sans diplôme
//updateKpiPopNoDegree: Met à jour le KPI: Population sans diplôme.
function updateKpiPopNoDegree(feature) {
  const kpiValue = document.getElementById('kpi-pop-no-degree-value');
  const kpiPop = document.getElementById('kpi-pop-tot');
  const kpiPct = document.getElementById('kpi-pop-no-degree-pct');
  
  if (!feature || !kpiValue || !kpiPop || !kpiPct) {
    // Réinitialiser si pas de feature sélectionnée
    if (kpiValue) kpiValue.textContent = '--';
    if (kpiPop) kpiPop.textContent = '--';
    if (kpiPct) kpiPct.textContent = '-- %';
    return;
  }
  
  const properties = feature.getProperties();
  const popNoDegree = properties.pop_no_degree;
  const popTotal = properties.pop_tot;
  const popNoDegreePct = properties.pop_no_degree_pct;
  
  // Animation de mise à jour
  kpiValue.classList.add('kpi-value-updating');
  kpiPop.classList.add('kpi-value-updating');
  kpiPct.classList.add('kpi-value-updating');
  
  setTimeout(() => {
    // Mettre à jour les valeurs
    if (popNoDegree !== undefined && popNoDegree !== null) {
      countUp(kpiValue, Number(popNoDegree));
    } else {
      kpiValue.textContent = 'N/D';
    }
    if (popTotal !== undefined && popTotal !== null) {
      countUp(kpiPop, Number(popTotal));
    } else {
      kpiPop.textContent = 'N/D';
    }

    if (popNoDegreePct !== undefined && popNoDegreePct !== null) {
      countUp(kpiPct, Number(popNoDegreePct), { decimals: 1, suffix: ' %' });
      
      // Changer la couleur selon le pourcentage (seuils éducation)
      if (popNoDegreePct > 30) {
        kpiValue.style.color = 'var(--bs-danger)';
        kpiPct.style.color = 'var(--bs-danger)';
      } else if (popNoDegreePct > 15) {
        kpiValue.style.color = 'var(--bs-warning)';
        kpiPct.style.color = 'var(--bs-warning)';
      } else {
        kpiValue.style.color = 'var(--bs-success)';
        kpiPct.style.color = 'var(--bs-success)';
      }
    } else {
      kpiPct.textContent = 'N/D %';
      kpiPct.style.color = 'var(--bs-secondary)';
    }
    
    // Retirer les classes d'animation
    setTimeout(() => {
      kpiValue.classList.remove('kpi-value-updating');
      kpiPop.classList.remove('kpi-value-updating');
      kpiPct.classList.remove('kpi-value-updating');
    }, 300);
  }, 200);
}

// Mettre à jour le KPI Ménages locataires
//updateKpiHouseholdRenter: Met à jour le KPI: Ménages locataires.

function updateKpiHouseholdRenter(feature) {
  const kpiValue = document.getElementById('kpi-household-renter-value');
  const kpiHouseholdTot = document.getElementById('kpi-household-tot');
  const kpiPct = document.getElementById('kpi-household-renter-pct');
  
  if (!feature || !kpiValue || !kpiHouseholdTot || !kpiPct) {
    // Réinitialiser si pas de feature sélectionnée
    if (kpiValue) kpiValue.textContent = '--';
    if (kpiHouseholdTot) kpiHouseholdTot.textContent = '--';  
    if (kpiPct) kpiPct.textContent = '-- %';
    return;
  }
  
  const properties = feature.getProperties();
  const householdRenter = properties.household_renter;
  const householdTot = properties.household_tot;
  const householdRenterPct = properties.household_renter_pct;
  
  // Animation de mise à jour
  kpiValue.classList.add('kpi-value-updating');
  kpiHouseholdTot.classList.add('kpi-value-updating');
  kpiPct.classList.add('kpi-value-updating');
  
  setTimeout(() => {
    // Mettre à jour les valeurs
    if (householdRenter !== undefined && householdRenter !== null) {
      countUp(kpiValue, Number(householdRenter));
    } else {
      kpiValue.textContent = 'N/D';
    }
    if (householdTot !== undefined && householdTot !== null) {
      countUp(kpiHouseholdTot, Number(householdTot));
    } else {
      kpiHouseholdTot.textContent = 'N/D';
    }

    if (householdRenterPct !== undefined && householdRenterPct !== null) {
      countUp(kpiPct, Number(householdRenterPct), { decimals: 1, suffix: ' %' });
      
      // Changer la couleur selon le pourcentage (seuils logement)
      if (householdRenterPct > 70) {
        kpiValue.style.color = 'var(--bs-danger)';
        kpiPct.style.color = 'var(--bs-danger)';
      } else if (householdRenterPct > 50) {
        kpiValue.style.color = 'var(--bs-warning)';
        kpiPct.style.color = 'var(--bs-warning)';
      } else {
        kpiValue.style.color = 'var(--bs-info)';
        kpiPct.style.color = 'var(--bs-info)';
      }
    } else {
      kpiPct.textContent = 'N/D %';
      kpiPct.style.color = 'var(--bs-secondary)';
    }
    
    // Retirer les classes d'animation
    setTimeout(() => {
      kpiValue.classList.remove('kpi-value-updating');
      kpiHouseholdTot.classList.remove('kpi-value-updating');
      kpiPct.classList.remove('kpi-value-updating');
    }, 300);
  }, 200);
}

// Mettre à jour le KPI Ménages d'une seule personne
//updateKpiHouseholdOnePerson: Met à jour le KPI: Ménages d'une seule personne.
function updateKpiHouseholdOnePerson(feature) {
  const kpiValue = document.getElementById('kpi-household-one-person-value');
  const kpiHouseholdTot = document.getElementById('kpi-household-total');
  const kpiPct = document.getElementById('kpi-household-one-person-pct');
  
  if (!feature || !kpiValue || !kpiPct || !kpiHouseholdTot) {
    // Réinitialiser si pas de feature sélectionnée
    if (kpiValue) kpiValue.textContent = '--';
    if (kpiHouseholdTot) kpiHouseholdTot.textContent = '--';
    if (kpiPct) kpiPct.textContent = '-- %';
    return;
  }
  
  const properties = feature.getProperties();
  const householdOnePerson = properties.household_one_person;
  const householdTot = properties.household_tot;
  const householdOnePersonPct = properties.household_one_person_pct;
  
  // Animation de mise à jour
  kpiValue.classList.add('kpi-value-updating');
  kpiHouseholdTot.classList.add('kpi-value-updating');
  kpiPct.classList.add('kpi-value-updating');
  
  setTimeout(() => {
    // Mettre à jour les valeurs
    if (householdOnePerson !== undefined && householdOnePerson !== null) {
      countUp(kpiValue, Number(householdOnePerson));
    } else {
      kpiValue.textContent = 'N/D';
    }

    if (householdTot !== undefined && householdTot !== null) {
      countUp(kpiHouseholdTot, Number(householdTot));
    } else {
      kpiHouseholdTot.textContent = 'N/D';
    }

    if (householdOnePersonPct !== undefined && householdOnePersonPct !== null) {
      countUp(kpiPct, Number(householdOnePersonPct), { decimals: 1, suffix: ' %' });
      
      // Changer la couleur selon le pourcentage (seuils isolement)
      if (householdOnePersonPct > 40) {
        kpiValue.style.color = 'var(--bs-danger)';
        kpiPct.style.color = 'var(--bs-danger)';
      } else if (householdOnePersonPct > 25) {
        kpiValue.style.color = 'var(--bs-warning)';
        kpiPct.style.color = 'var(--bs-warning)';
      } else {
        kpiValue.style.color = 'var(--bs-success)';
        kpiPct.style.color = 'var(--bs-success)';
      }
    } else {
      kpiPct.textContent = 'N/D %';
      kpiPct.style.color = 'var(--bs-secondary)';
    }
    
    // Retirer les classes d'animation
    setTimeout(() => {
      kpiValue.classList.remove('kpi-value-updating');
      kpiHouseholdTot.classList.remove('kpi-value-updating');
      kpiPct.classList.remove('kpi-value-updating');
    }, 300);
  }, 200);
}

// Obtenir les données moyennes pour initialiser tous les KPIs selon la couche active
/**getAverageKpiData: Calcule les moyennes des indicateurs pour la couche visible (AD ou ADA).*/
function getAverageKpiData() {
  let totalPopLico = 0;
  let totalPop = 0;
  let totalPopLicoPct = 0;
  let totalPopNoDegree = 0;
  let totalPopNoDegreePct = 0;
  let totalHouseholdRenter = 0;
  let totalHouseholdRenterPct = 0;
  let totalHouseholdOnePerson = 0;
  let totalHouseholdOnePersonPct = 0;
  let totalHousehold = 0;
  // Variables pour les populations par âge
  let totalAge65 = 0;
  let totalAge75 = 0;
  let totalAge85 = 0;
  let totalAge65Pct = 0;
  let totalAge75Pct = 0;
  let totalAge85Pct = 0;
  
  let count = 0;
  
  // Déterminer quelle couche utiliser selon le zoom ACTUEL
  const currentZoom = map.getView().getZoom();
  let sourceToCheck = null;
  let layerName = "";
  
  if (currentZoom >= ZOOM_THRESHOLD && adData) {
    sourceToCheck = adData;
    layerName = "AD";
  } else if (adaData) {
    sourceToCheck = adaData;
    layerName = "ADA";
  }
  
  console.log(`Calcul des moyennes pour la couche ${layerName} (zoom: ${currentZoom?.toFixed(1)})`);
  
  if (sourceToCheck) {
    sourceToCheck.forEach(feature => {
      const popLico = feature.get('pop_lico_at');
      const popLicoPct = feature.get('pop_lico_at_pct');
      const popTotal = feature.get('pop_tot');
      const popNoDegree = feature.get('pop_no_degree');
      const popNoDegreePct = feature.get('pop_no_degree_pct');
      const householdRenter = feature.get('household_renter');
      const householdRenterPct = feature.get('household_renter_pct');
      const householdOnePerson = feature.get('household_one_person');
      const householdOnePersonPct = feature.get('household_one_person_pct');
      const householdTot = feature.get('household_tot');
      // Récupérer les données d'âge
      const age65 = feature.get('age_over_65');
      const age75 = feature.get('age_over_75');
      const age85 = feature.get('age_over_85');
      const age65Pct = feature.get('age_over_65_pct');
      const age75Pct = feature.get('age_over_75_pct');
      const age85Pct = feature.get('age_over_85_pct');
      
      if (popTotal !== undefined && popTotal !== null && !isNaN(popTotal) && popTotal > 0) {
        totalPopLico += Number(popLico || 0);
        totalPopLicoPct += Number(popLicoPct || 0);
        totalPop += Number(popTotal);
        totalPopNoDegree += Number(popNoDegree || 0);
        totalPopNoDegreePct += Number(popNoDegreePct || 0);
        totalHouseholdRenter += Number(householdRenter || 0);
        totalHouseholdRenterPct += Number(householdRenterPct || 0);
        totalHouseholdOnePerson += Number(householdOnePerson || 0);
        totalHouseholdOnePersonPct += Number(householdOnePersonPct || 0);
        totalHousehold += Number(householdTot || 0);
        
        // AJOUTER : Accumuler les données d'âge
        totalAge65 += Number(age65 || 0);
        totalAge75 += Number(age75 || 0);
        totalAge85 += Number(age85 || 0);
        
        // Si les pourcentages existent, les accumuler, sinon on les calculera
        if (age65Pct !== undefined && age65Pct !== null) {
          totalAge65Pct += Number(age65Pct);
        }
        if (age75Pct !== undefined && age75Pct !== null) {
          totalAge75Pct += Number(age75Pct);
        }
        if (age85Pct !== undefined && age85Pct !== null) {
          totalAge85Pct += Number(age85Pct);
        }
        
        count++;
      }
    });
  }
  
  console.log(`Moyennes calculées sur ${count} entités de la couche ${layerName}`);
  
  // Calculer les moyennes
  const result = {
    avgPopLico: count > 0 ? Math.round(totalPopLico / count) : 0,
    avgPopLicoPct: count > 0 ? (totalPopLicoPct / count) : 0,
    avgPopNoDegree: count > 0 ? Math.round(totalPopNoDegree / count) : 0,
    avgPopNoDegreePct: count > 0 ? (totalPopNoDegreePct / count) : 0,
    avgPop: count > 0 ? Math.round(totalPop / count) : 0,
    avgHouseholdRenter: count > 0 ? Math.round(totalHouseholdRenter / count) : 0,
    avgHouseholdRenterPct: count > 0 ? (totalHouseholdRenterPct / count) : 0,
    avgHouseholdOnePerson: count > 0 ? Math.round(totalHouseholdOnePerson / count) : 0,
    avgHouseholdOnePersonPct: count > 0 ? (totalHouseholdOnePersonPct / count) : 0,
    avgHousehold: count > 0 ? Math.round(totalHousehold / count) : 0,
    // Moyennes des populations par âge
    avgAge65: count > 0 ? Math.round(totalAge65 / count) : 0,
    avgAge75: count > 0 ? Math.round(totalAge75 / count) : 0,
    avgAge85: count > 0 ? Math.round(totalAge85 / count) : 0,
    avgAge65Pct: count > 0 ? (totalAge65Pct / count) : 0,
    avgAge75Pct: count > 0 ? (totalAge75Pct / count) : 0,
    avgAge85Pct: count > 0 ? (totalAge85Pct / count) : 0,
    totalPop                                            // Somme réelle — pour la barre "population totale"
  };
  
  return result;
}

// Mettre à jour les KPI avec les moyennes de la couche active
// updateKpisWithCurrentLayerAverages: Injecte les moyennes de la couche visible dans les KPI.
function updateKpisWithCurrentLayerAverages() {
  const averages = getAverageKpiData();
  
  // Créer une feature simulée avec TOUTES les moyennes
  const avgFeature = new ol.Feature({
    pop_lico_at: averages.avgPopLico,
    pop_lico_at_pct: averages.avgPopLicoPct,
    pop_no_degree: averages.avgPopNoDegree,
    pop_no_degree_pct: averages.avgPopNoDegreePct,
    pop_tot: averages.avgPop,
    household_renter: averages.avgHouseholdRenter,
    household_renter_pct: averages.avgHouseholdRenterPct,
    household_one_person: averages.avgHouseholdOnePerson,
    household_one_person_pct: averages.avgHouseholdOnePersonPct,
    household_tot: averages.avgHousehold,
    // Les moyennes des populations par âge
    age_over_65: averages.avgAge65,
    age_over_75: averages.avgAge75,
    age_over_85: averages.avgAge85,
    age_over_65_pct: averages.avgAge65Pct,
    age_over_75_pct: averages.avgAge75Pct,
    age_over_85_pct: averages.avgAge85Pct
  });
  
  // Mettre à jour les KPIs
  updateKpiPopLico(avgFeature);
  updateKpiPopNoDegree(avgFeature);
  updateKpiHouseholdRenter(avgFeature);
  updateKpiHouseholdOnePerson(avgFeature);
  updatePopulationStats(avgFeature); // Mettre à jour  les statistiques de population
  updateSocioEconomicChart(avgFeature); // Mettre à jour  le graphique socio-économique
  updateKpiGaugesWithAverages(); // Mettre à jour les jauges avec les moyennes

  console.log('KPI, statistiques et graphique mis à jour avec les moyennes de la couche active');
}
// Variable pour suivre si une entité spécifique est sélectionnée
let isSpecificEntitySelected = false;

// Initialiser tous les KPIs avec des données moyennes au démarrage
// initKpisWithAverageData: Initialise les KPI avec les moyennes de la couche active.
function initKpisWithAverageData() {
  isSpecificEntitySelected = false;
  updateKpisWithCurrentLayerAverages();
  currentSelectedFeature = null;
}

// Section Taille Résidentielle
// updateResidentialFields: Met à jour les champs d'affichage résidentiel (codes AD/ADA, unités, % végétation)
function updateResidentialFields(feature, layerType) {
  const divisionAreaCode = document.getElementById('division-area-code');
  const aggregatedDivisionCode = document.getElementById('aggregated-division-code');
  const unitsCount = document.getElementById('units-count');
  const vegUnitsCount = document.getElementById('veg-units-count');
  const vegPct = document.getElementById('veg-pct'); // Nouveau champ (déjà dans ton HTML)

  // Utilitaire: format d'entier pour affichage
  const fmtInt = (v) => Number(v).toLocaleString('fr-CA');

  // RESET si aucune entité
  if (!feature) {
    if (divisionAreaCode) divisionAreaCode.textContent = '--';
    if (aggregatedDivisionCode) aggregatedDivisionCode.textContent = '--';
    if (unitsCount) unitsCount.textContent = '--';
    if (vegUnitsCount) vegUnitsCount.textContent = '--';
    if (vegPct) vegPct.textContent = '-- %';

    [divisionAreaCode, aggregatedDivisionCode, unitsCount, vegUnitsCount, vegPct].forEach(el => {
      if (el) el.classList.remove('has-data', 'updating');
    });
    return;
  }

  // Pour récupérer les propriétés des zones (AD/ADA) même si la feature active est un point de végétation
  // -> on garde la logique de jointure pour les codes, unités agrégées, etc.
  let dataFeature = feature;
  if (layerType === 'vegetation') {
    const matchingFeature = typeof findContainingFeatureByJoin === 'function'
      ? findContainingFeatureByJoin(feature)
      : null;
    dataFeature = matchingFeature || feature;
  }
  const properties = dataFeature.getProperties();

  // Petite animation
  [divisionAreaCode, aggregatedDivisionCode, unitsCount, vegUnitsCount, vegPct].forEach(el => {
    if (el) el.classList.add('updating');
  });

  setTimeout(() => {
    // Code AD (DAUID)
    if (divisionAreaCode) {
      const dauid = properties.dauid || properties.ad_code || 'N/A';
      divisionAreaCode.textContent = dauid;
      divisionAreaCode.classList.add('has-data');
    }

    // Code ADA (ADAUID)
    if (aggregatedDivisionCode) {
      const adauid = properties.adauid || properties.ada_code || 'N/A';
      aggregatedDivisionCode.textContent = adauid;
      aggregatedDivisionCode.classList.add('has-data');
    }

    // Nombre total d'unités
    if (unitsCount) {
      let units = 'N/A';
      if (layerType === 'vegetation') {
        // Dans la couche points, on lit la valeur au point
        units = feature.get('tot_unit') ?? 'N/A';
      } else {
        // Dans les polygones AD/ADA
        units = properties.nb_unit ?? 'N/A';
      }
      if (units !== 'N/A' && !isNaN(units)) {
        unitsCount.textContent = fmtInt(units);
      } else {
        unitsCount.textContent = units;
      }
      unitsCount.classList.add('has-data');
    }

    // Nombre d'unités avec végétation >= 30%
    if (vegUnitsCount) {
      let vegUnits = 'N/A';
      if (layerType === 'vegetation') {
        vegUnits = feature.get('unit_veg30') ?? 'N/A';
      } else {
        vegUnits = properties.unit_vegetation_above_30_pct ?? 'N/A';
      }
      if (vegUnits !== 'N/A' && !isNaN(vegUnits)) {
        vegUnitsCount.textContent = fmtInt(vegUnits);
      } else {
        vegUnitsCount.textContent = vegUnits;
      }
      vegUnitsCount.classList.add('has-data');
    }

    // *** Pourcentage de végétation % (entiers déjà prêts) ***
    if (vegPct) {
      // IMPORTANT : on prend la valeur de la couche active
      const rawPct = (layerType === 'vegetation')
        ? feature.get('vegetation_pct')
        : properties.vegetation_pct;

      if (rawPct !== undefined && rawPct !== null && rawPct !== 'N/A' && !isNaN(rawPct)) {
        vegPct.textContent = parseInt(rawPct, 10) + ' %';
      } else {
        vegPct.textContent = 'N/A';
      }
      vegPct.classList.add('has-data');
    }

    // Fin animation
    setTimeout(() => {
      [divisionAreaCode, aggregatedDivisionCode, unitsCount, vegUnitsCount, vegPct].forEach(el => {
        if (el) el.classList.remove('updating');
      });
    }, 300);
  }, 200);
}



// Fonction pour effacer les sélections précédentes de code postal
/**
 * clearPostalCodeSelections: Efface les sélections (cercles) précédemment ajoutées.
 * (Reset aussi l’état du dernier CP recherché)
 */
function clearPostalCodeSelections() {
  selectionSource.clear();
  lastSearchedPostalCode = null;
}

// Distance au carré (évite sqrt pour la vitesse)
function dist2(a, b) {
  const dx = a[0] - b[0], dy = a[1] - b[1];
  return dx*dx + dy*dy;
}

/**
 * Retourne une coordonnée STRICTEMENT issue d'un point du code postal.
 * - Point       -> coordonnées du point
 * - MultiPoint  -> le point le plus proche du centroïde des points
 * - Autres (Polygon/Line) -> cherche les points d'adresse (vegetationData) avec le même postal_code
 *                            et prend le plus proche du centre de la géométrie; sinon fallback intérieur/centre.
 */
function getPostalPointCoordinate(feature) {
  const geom = feature.getGeometry();
  const type = geom.getType();
  if (type === 'Point') {
    return geom.getCoordinates();
  }

  if (type === 'MultiPoint') {
    const pts = geom.getCoordinates();
    if (!pts.length) return ol.extent.getCenter(geom.getExtent());
    const c = pts.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]).map(v => v / pts.length);
    return pts.reduce((best, p) => (dist2(p, c) < dist2(best, c) ? p : best), pts[0]);
  }

  // ⚠️ on suppose que 'candidates' est défini plus haut dans ton code comme
  // la liste des features address_vegetation2018.geojson filtrées par 'postal'
  if (candidates && candidates.length) {
    const centerGeom = (type.indexOf('Polygon') !== -1)
      ? geom.getInteriorPoint().getCoordinates()
      : ol.extent.getCenter(geom.getExtent());
    return candidates
      .map(f => f.getGeometry().getCoordinates())
      .reduce(
        (best, p) => (dist2(p, centerGeom) < dist2(best, centerGeom) ? p : best),
        candidates[0].getGeometry().getCoordinates()
      );
  }

  // Fallbacks si pas de candidat
  return (type.indexOf('Polygon') !== -1)
    ? geom.getInteriorPoint().getCoordinates()
    : ol.extent.getCenter(geom.getExtent());
}

// Fonction pour ajouter un cercle de sélection autour d'un point
function addPostalCodeSelectionCircle(feature, radius = 100) {
  if (!feature || !feature.getGeometry) return;

  // 1) Centre = un VRAI point de ce code postal (et pas un centroïde)
  const center = getPostalPointCoordinate(feature);

  // Créer le cercle (rayon en mètres si la vue est en EPSG:3857)
  const circle = new ol.geom.Circle(center, radius);
  const circleFeature = new ol.Feature(circle);
  circleFeature.set('type', 'postal_code_selection');
  circleFeature.set('postal_code', feature.get('postal_code') || feature.get('postalcode') || null);

  // Style du cercle
  circleFeature.setStyle(new ol.style.Style({
    stroke: new ol.style.Stroke({ color: '#0993FF', width: 2 }),
    fill:   new ol.style.Fill({  color: 'rgba(0,153,255,0.25)' })
  }));

  // Ajouter à la source de sélection
  selectionSource.addFeature(circleFeature);

  console.log('Cercle ajouté sur un point réel du code postal:', circleFeature.get('postal_code'));
}

// Fonction de clignotement simple
function startBlinking(feature, layerType) {
  isBlinkVisible = true;
  
  blinkTimer = setInterval(() => {
    if (!highlighted || highlighted !== feature) {
      clearInterval(blinkTimer);
      return;
    }

    if (isBlinkVisible) {
      // Style clignotant (surbrillance)
      if (layerType === 'vegetation') {
        // Pour végétation : créer un style très visible avec cercle jaune
        const blinkStyle = new ol.style.Style({
          image: new ol.style.Circle({
            radius: 5,
            fill: new ol.style.Fill({ color: '#ffff00' }), // Jaune vif
            stroke: new ol.style.Stroke({ color: '#ff0000', width: 2 }) // Contour rouge
          })
        });
        feature.setStyle(blinkStyle);
      } else {
        const s = featureStyle(feature);
        if (s) { 
          s.getStroke().setColor("#ffff00"); // Jaune vif
          s.getStroke().setWidth(4); 
          feature.setStyle(s); 
        }
      }
    } else {
      // Style normal
      if (layerType === 'vegetation') {
        feature.setStyle(vegetationStyle(feature));
      } else {
        feature.setStyle(featureStyle(feature));
      }
    }
    
    isBlinkVisible = !isBlinkVisible;
  }, 500); // Clignote toutes les 500ms
}

//selectFeature: Sélectionne une entité et met à jour tous les indicateurs
function selectFeature(feature, layerType, coordinate = null) {
  if (!feature) return;

  // --- Effacer le cercle postal si on sélectionne une AUTRE entité ---
  // Si la feature cliquée n'a pas le même code postal que le dernier recherché,
  // ou n'a pas de code postal, on éteint le cercle.
  const selectedPostal = feature && feature.get
    ? (feature.get('postal_code') || feature.get('postalcode') || null)
    : null;
  if (!selectedPostal || selectedPostal !== lastSearchedPostalCode) {
    clearPostalCodeSelections(); // remet aussi lastSearchedPostalCode à null si tu as suivi mon patch précédent
  }

  // Arrêter le clignotement précédent
  if (blinkTimer) {
    clearInterval(blinkTimer);
    blinkTimer = null;
  }

  // Fermer le popup précédent s'il y en a un
  closePopup();

  // Mettre à jour tous les KPIs avec jointure par attributs
  currentSelectedFeature = feature;
  isSpecificEntitySelected = true;
  const featureForKpis = updateKpisWithJoin(feature, layerType);
  
  // Mettre à jour les champs résidentiels
  updateResidentialFields(feature, layerType);
  
  // Si c'est un point de végétation, remplir le champ de code postal
  if (layerType === 'vegetation') {
    const postalCodeInput = document.getElementById('postal-code-search');
    const postalCode = feature.get('postal_code');
    if (postalCodeInput && postalCode) {
      postalCodeInput.value = postalCode.toString().toUpperCase();
      console.log('Champ code postal mis à jour:', postalCode);
    }
  } else {
    // Si ce n'est pas de la végétation, vider le champ de code postal
    const postalCodeInput = document.getElementById('postal-code-search');
    if (postalCodeInput) {
      postalCodeInput.value = '';
      console.log('Champ code postal vidé (entité non-végétation sélectionnée)');
    }
  }

  if (featureForKpis) {
    console.log('Entité spécifique sélectionnée - affichage des données individuelles');
  }

  // Gestion de la surbrillance
  if (highlighted && highlighted !== feature) {
    if (highlighted.get('vegetation_pct') !== undefined) {
      highlighted.setStyle(vegetationStyle(highlighted));
    } else {
      highlighted.setStyle(featureStyle(highlighted));
    }
  }
  highlighted = feature;

  // Démarrer le clignotement au lieu de la surbrillance fixe
  startBlinking(feature, layerType);

  // Ouvrir le popup si une coordonnée est fournie
  if (coordinate) {
    showPopupForFeature(feature, layerType, coordinate);
  }
}

// showPopupForFeature: Affiche le popup pour une entité donnée
function showPopupForFeature(feature, layerType, coordinate) {
  const p = feature.getProperties();
  const [lon, lat] = ol.proj.toLonLat(coordinate);
  const q = `${lat.toFixed(6)},${lon.toFixed(6)}`;
  const t = TRANSLATIONS[currentLang] || TRANSLATIONS['fr'];

  // Contenu du popup selon le type de feature avec styling Bootstrap
  if (layerType === 'vegetation') {
    // --- Popup Végétation ---
    content.innerHTML = `
      <h3 class="popup-header d-flex align-items-center">
        <i class="fas fa-leaf text-success me-2"></i>
        ${t['popup-veg-title']}
      </h3>
      <div class="mt-3">
        ${row(t['popup-veg-postal'], p.postal_code || "—")}
        ${row(t['popup-veg-dauid'], p.dauid || "—")}
        ${row(t['popup-veg-adauid'], p.adauid || "—")}
        ${row(t['popup-veg-units'], fmtNum(p.tot_unit))}
        ${row(t['popup-veg-units30'], fmtNum(p.unit_veg30))}
        ${row(t['popup-veg-pct'], fmtPct(p.vegetation_pct))}
        ${row(t['popup-veg-level'], labelFromLevel(p.vulnerability_level))}
      </div>
      <div class="popup-actions">
        <a href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noreferrer" class="btn btn-outline-primary btn-sm">
          <i class="fas fa-external-link-alt me-1"></i>${t['popup-gmaps']}
        </a>
      </div>
    `;
  } else {
    // --- Popup Vulnérabilité (AD / ADA) basé sur le ZOOM ---
    const isAD = map.getView().getZoom() >= ZOOM_THRESHOLD;       // true => AD, false => ADA
    const unitLabel = isAD ? 'AD' : 'ADA';
    // ID cohérent avec le niveau : en AD on affiche dauid, en ADA on affiche adauid
    const unitId = isAD
      ? (p.dauid ?? p.adauid ?? "N/A")
      : (p.adauid ?? p.dauid ?? "N/A");
    // Niveau de vulnérabilité cohérent avec le niveau
    const vulnerabilityLevel = isAD
      ? (p.ad_vulnerability_level  ?? p.ada_vulnerability_level)
      : (p.ada_vulnerability_level ?? p.ad_vulnerability_level);

    const vegPct = (p.nb_unit > 0 && p.unit_vegetation_above_30_pct != null)
      ? Math.min((Number(p.unit_vegetation_above_30_pct) / Number(p.nb_unit)) * 100, 100).toFixed(1)
      : 0;

    content.innerHTML = `
      <h3 class="popup-header d-flex align-items-center">
        <i class="fas fa-map-marked-alt text-primary me-2"></i>
        ${unitLabel} ${unitId}
      </h3>

      <!-- Infos principales -->
      <div class="mt-1">
        ${row(t['popup-vuln-level'], labelFromLevel(vulnerabilityLevel))}
        <hr class="my-1">
        ${rowRatio(t['popup-pop-65'],           p.age_over_65,                  p.pop_tot)}
        ${rowRatio(t['popup-pop-lico'],         p.pop_lico_at,                  p.pop_tot)}
        ${rowRatio(t['popup-pop-nodeg'],        p.pop_no_degree,                p.pop_tot)}
        ${rowRatio(t['popup-household-renter'], p.household_renter,             p.household_tot)}
        ${rowRatio(t['popup-household-one'],    p.household_one_person,         p.household_tot)}
        ${rowRatio(t['popup-units-veg'],        p.unit_vegetation_above_30_pct, p.nb_unit)}
        <div class="popup-veg-bar-track">
          <div class="popup-veg-bar-fill" data-pct="${vegPct}"></div>
        </div>
      </div>

      <!-- Google Maps -->
      <div class="popup-actions">
        <a href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noreferrer" class="btn btn-outline-primary btn-sm">
          <i class="fas fa-external-link-alt me-1"></i>${t['popup-gmaps']}
        </a>
      </div>

      <!-- Bouton "Voir plus" -->
      <button class="popup-more-btn" aria-expanded="false"
        onclick="
          const extra = this.nextElementSibling;
          const open  = extra.classList.toggle('open');
          this.classList.toggle('open', open);
          this.setAttribute('aria-expanded', open);
          this.querySelector('.popup-more-label').textContent =
            open ? '${t['popup-less']}' : '${t['popup-more']}';
        ">
        <i class="fas fa-chevron-down popup-more-icon"></i>
        <span class="popup-more-label">${t['popup-more']}</span>
      </button>

      <!-- Détails complets (dépliables) -->
      <div class="popup-extra">
        <hr class="my-2">
        ${rowRatio(t['popup-pop-75'], p.age_over_75, p.pop_tot)}
        ${rowRatio(t['popup-pop-85'], p.age_over_85, p.pop_tot)}
      </div>
    `;
  }

  // Animation d’apparition du popup
  container.classList.remove("show");
  overlay.setPosition(coordinate);
  requestAnimationFrame(() => container.classList.add("show"));
}

// Fonction de recherche par code postal
function searchByPostalCode(postalCode) {
  var t = TRANSLATIONS[currentLang] || TRANSLATIONS["fr"];

  // 1) Vérif. saisie
  if (!postalCode) {
    showPostalCodeAlert(t["alert-postal-invalid"], "warning");
    return;
  }

  // 2) Normaliser seulement l’ENTRÉE utilisateur (pas les données)
  var normalizedCode = postalCode.toString().toUpperCase().replace(/\s/g, "");

  // 3) Valider le format strict A1A1A1
  var postalRegex = /^[A-Z]\d[A-Z]\d[A-Z]\d$/;
  if (!postalRegex.test(normalizedCode)) {
    showPostalCodeAlert(t["alert-postal-invalid"], "warning");
    return;
  }

  // 4) Vérifier la présence de la couche de végétation
  if (!vegetationData || !Array.isArray(vegetationData) || vegetationData.length === 0) {
    showPostalCodeAlert(t["alert-postal-no-data"], "warning");
    return;
  }

  // 5) Nettoyer les sélections précédentes
  clearPostalCodeSelections();

  // 6) Recherche EXACTE dans le seul champ postal_code de la couche vegetation
  var foundFeature = vegetationData.find(function(feature) {
    var featurePostal = feature.get("postal_code");
    return featurePostal === normalizedCode;
  });

  // 7) Si non trouvé → message
  if (!foundFeature) {
    showPostalCodeAlert(t["alert-postal-invalid"], "warning");
    return;
  }

  // 8) Si trouvé → cercle + zoom + sélection comme un clic
  var radiusSize = 100;
  addPostalCodeSelectionCircle(foundFeature, radiusSize);

  lastSearchedPostalCode = normalizedCode;

  var geometry = foundFeature.getGeometry();
  var extent = geometry.getExtent();
  var center = getPostalPointCoordinate(foundFeature);

  map.getView().fit(extent, {
    padding: [100, 100, 100, 100],
    maxZoom: 16,
    duration: 500
  });

  setTimeout(function() {
    selectFeature(foundFeature, "vegetation", center);
  }, 600);

  showPostalCodeAlert(t["alert-postal-found"], "success");
}

// Fonction pour afficher les alertes de recherche
//showPostalCodeAlert: Affiche une alerte Bootstrap en haut de la barre de recherche.

function showPostalCodeAlert(message, type = 'info') {
  // Supprimer l'alerte précédente s'il y en a une
  const existingAlert = document.querySelector('.postal-code-alert');
  if (existingAlert) {
    existingAlert.remove();
  }
  
  const alertDiv = document.createElement('div');
  const alertClass = type === 'success' ? 'alert-success' : 
                     type === 'warning' ? 'alert-warning' : 'alert-info';
  
  alertDiv.className = `alert ${alertClass} alert-dismissible fade show postal-code-alert`;
  alertDiv.style.cssText = 'margin-top: 10px; margin-bottom: 0; font-size: 0.875rem;';
  
  const icon = type === 'success' ? 'fa-check-circle' : 
               type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle';
  
  alertDiv.innerHTML = `
    <i class="fas ${icon} me-2"></i>
    ${message}
    <button type="button" class="btn-close btn-close-sm" data-bs-dismiss="alert" aria-label="Fermer"></button>
  `;
  
  // Trouver le conteneur de la barre de recherche et insérer l'alerte après
  const searchContainer = document.getElementById('postal-code-search')?.parentElement;
  if (searchContainer) {
    searchContainer.appendChild(alertDiv);
  } else {
    // Fallback : insérer après le champ de recherche directement
    const searchInput = document.getElementById('postal-code-search');
    if (searchInput) {
      searchInput.parentNode.insertBefore(alertDiv, searchInput.nextSibling);
    }
  }
  
  // Auto-suppression après 4 secondes
  setTimeout(() => {
    if (alertDiv.parentNode) {
      alertDiv.remove();
    }
  }, 4000);
}



// Fonds de carte
/** basemaps: Dictionnaire des fonds de carte disponibles. */
const basemaps = {
  street: new ol.layer.Tile({
    title: "Street Maps (OSM)",
    visible: true, // actif par défaut
    source: new ol.source.OSM()
  }),
  terrain: new ol.layer.Tile({
    title: "Terrain (Google)",
    visible: false, 
    source: new ol.source.XYZ({
      url: "https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}",
      attributions: "© Google"
    })
  }),
  satellite: new ol.layer.Tile({
    title: "Satellite (Esri)",
    visible: false,
    source: new ol.source.XYZ({
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attributions: "Tiles © Esri"
    })
  }),
  dark: new ol.layer.Tile({
    title: "Dark (Carto)",
    visible: false,
    source: new ol.source.XYZ({
      url: "https://{a-c}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      attributions:
        '© <a href="https://www.openstreetmap.org/copyright">OSM</a> · '+
        '© <a href="https://carto.com/attributions">CARTO</a>'
    })
  })
};



// Carte + échelle
/** map: Instance OpenLayers ol.Map (carte principale). */
const map = new ol.Map({
  target: "map",
  layers: [basemaps.street, basemaps.terrain, basemaps.satellite, basemaps.dark],
  view: new ol.View({
    center: ol.proj.fromLonLat([-73.5673, 45.5017]),
    zoom: 11  // Réduit de 10 à 8 pour une vue plus éloignée
  })
});
map.addControl(new ol.control.ScaleLine());

// Le bouton "Fonds de carte" est positionné via CSS (bottom: 12px; left: 15px)
// La barre d'échelle est positionnée via CSS (bottom: 12px; left: 130px)



// Sélecteur graphique (fonds de carte) - Compatible Bootstrap


const bmPanel = document.getElementById("bm-panel");
const bmOpen  = document.getElementById("bm-open");
const bmClose = document.getElementById("bm-close");
const bmCards = document.querySelectorAll(".bm-card");

/**
 * showBmPanel: Affiche/masque le panneau des vignettes de fonds de carte.
 */
function showBmPanel(show){
  bmPanel.classList.toggle("show", !!show);
  bmPanel.setAttribute("aria-hidden", show ? "false" : "true");
}

bmOpen.addEventListener("click", ()=> showBmPanel(!bmPanel.classList.contains("show")));
bmClose.addEventListener("click", ()=> showBmPanel(false));

// Fermeture en cliquant à l'extérieur
document.addEventListener("click", (e)=>{
  if(!bmPanel.contains(e.target) && !bmOpen.contains(e.target)) showBmPanel(false);
});

/** Thumbnails et labels par clé de fond de carte */
const BM_THUMBS = {
  street:    "https://tile.openstreetmap.org/10/301/386.png",
  terrain:   "https://mt1.google.com/vt/lyrs=p&x=301&y=386&z=10",
  satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/10/386/301",
  dark:      "https://a.basemaps.cartocdn.com/dark_all/10/301/386.png"
};
const BM_LABELS = {
  street: "Street", terrain: "Terrain", satellite: "Satellite", dark: "Dark"
};
/** Fond alternatif affiché dans le bouton (inverse du fond actif) */
const BM_ALT = {
  street:    "satellite",
  terrain:   "satellite",
  satellite: "street",
  dark:      "street"
};

/**
 * activateBasemap: Active un fond de carte et met à jour la vignette du bouton déclencheur.
 * Le bouton affiche le fond ALTERNATIF (non actif) pour indiquer le prochain choix possible.
 */
function activateBasemap(key) {
  Object.entries(basemaps).forEach(([k, layer]) => layer.setVisible(k === key));

  // Mettre à jour les vignettes du panel
  bmCards.forEach(card => {
    card.classList.remove("selected");
    if (card.dataset.key === key) card.classList.add("selected");
  });

  // Bouton déclencheur : afficher le fond ALTERNATIF (pas le fond actif)
  const altKey = BM_ALT[key] || "satellite";
  const thumb = document.getElementById("bm-active-thumb");
  const altLabel = document.getElementById("bm-alt-label");
  if (thumb) thumb.src = BM_THUMBS[altKey];
  if (altLabel) altLabel.textContent = BM_LABELS[altKey] || altKey;

  localStorage.setItem("basemap_key", key);
}

bmCards.forEach(card=>{
  card.addEventListener("click", ()=>{
    activateBasemap(card.dataset.key);
    showBmPanel(false);
  });
});

// Activation du basemap par défaut
activateBasemap(localStorage.getItem("basemap_key") || "terrain");



// Sources et couches de données GeoJSON avec LOD


/**
 * adaSource: Source vecteur pour ADA.
 */
const adaSource = new ol.source.Vector(); // Couche faible zoom (ada_2018)
/**
 * adSource: Source vecteur pour AD.
 */
const adSource = new ol.source.Vector();  // Couche fort zoom (ad_2018)
/**
 * vegetationSource: Source vecteur pour Végétation.
 */
const vegetationSource = new ol.source.Vector(); // Couche végétation (address_vegetation2018)

// Source pour les sélections de recherche
const selectionSource = new ol.source.Vector();

/**
 * adaLayer: Couche vecteur ADA (style dynamique).
 */
const adaLayer = new ol.layer.Vector({ 
  source: adaSource, 
  style: featureStyle,
  minZoom: 0,
  maxZoom: ZOOM_THRESHOLD
});

/**
 * adLayer: Couche vecteur AD (style dynamique).
 */
const adLayer = new ol.layer.Vector({ 
  source: adSource, 
  style: featureStyle,
  minZoom: ZOOM_THRESHOLD,
  maxZoom: 22  // Garde la couche AD visible même aux zooms élevés
});

/**
 * vegetationLayer: Couche vecteur Végétation (points).
 */
const vegetationLayer = new ol.layer.Vector({
  source: vegetationSource,
  style: vegetationStyle,
  minZoom: ZOOM_VEGETATION,
  maxZoom: 22
});

// Couche pour les sélections de recherche
const selectionLayer = new ol.layer.Vector({
  source: selectionSource,
  style: new ol.style.Style({
    fill: new ol.style.Fill({ color: 'rgba(255, 255, 0, 0.2)' }),
    stroke: new ol.style.Stroke({ color: '#ffff00', width: 3 })
  }),
  zIndex: 1000
});

// Variables pour stocker les données chargées
let adaData = null;
let adData = null;
let vegetationData = null;
/**
 * initialExtent: initialisation d'un module ou de données.
 */
let initialExtent = null;

map.addLayer(adaLayer);
map.addLayer(adLayer);
map.addLayer(vegetationLayer);
map.addLayer(selectionLayer);

// Chargement initial des données
Promise.all([
  loadGeoJSON(DATA_URL1, 'ada'), // ada_2018
  loadGeoJSON(DATA_URL2, 'ad'),   // ad_2018
  loadGeoJSON(DATA_URL3, 'vegetation') // address_vegetation2018
]).then(() => {
  console.log('Toutes les données sont chargées');
  console.log('ADA data:', adaData ? adaData.length : 0, 'entités');
  console.log('AD data:', adData ? adData.length : 0, 'entités');
  
  updateLayerVisibility();
  
  // Attendre un peu plus pour être sûr que tout est prêt
  setTimeout(() => {
    initKpisWithAverageData();
    initSocioEconomicChart(); // Ajouter cette ligne
    updateSocioEconomicChart(null); // Ajouter cette ligne
  }, 500); // Augmenté à 800ms pour être sûr
}).catch(error => {
  console.error('Erreur lors du chargement des données:', error);
});

async function loadGeoJSON(url, type){
  try {
    const res = await fetch(url, { cache:"no-store" });
    if(!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const json = await res.json();
    const crs = guessCRS(json);
    const feats = new ol.format.GeoJSON().readFeatures(json, {
      dataProjection: crs,
      featureProjection: "EPSG:3857"
    });

    if (type === 'ada') {
      adaData = feats;
      adaSource.clear();
      adaSource.addFeatures(feats);
      // Définir l'étendue initiale avec ada_2018 (plus générale)
      if (!initialExtent) {
        initialExtent = adaSource.getExtent();
        map.getView().fit(initialExtent, {
          padding: [30, 30, 100, 100],  // bas et gauche augmentés pour la légende (bottom-left)
          maxZoom: 11
        });
      }
    } else if (type === 'ad') {
      adData = feats;
      adSource.clear();
      adSource.addFeatures(feats);
    } else if (type === 'vegetation') {
      vegetationData = feats;
      vegetationSource.clear();
      vegetationSource.addFeatures(feats);
    }

    console.log(`Données ${type} chargées: ${feats.length} entités`);
  } catch (error) {
    console.error(`Erreur lors du chargement de ${url}:`, error);
  }
}

function guessCRS(json){
  const g = json.features?.[0]?.geometry; if(!g) return "EPSG:4326";
  const xy = (function f(c){ return Array.isArray(c[0]) ? f(c[0]) : c; })(g.coordinates);
  const [x,y] = xy || [0,0];
  return (Math.abs(x)<=180 && Math.abs(y)<=90) ? "EPSG:4326" : "EPSG:3857";
}



// Gestion du changement de zoom (LOD) avec mise à jour automatique des moyennes
// UpdateLayerVisibility: met à jour une partie de l'UI ou des indicateurs.

function updateLayerVisibility() {
  const currentZoom = map.getView().getZoom();
  
  if (currentZoom >= ZOOM_VEGETATION) {
    // Très fort zoom : afficher ad_2018 + végétation
    adaLayer.setVisible(false);
    adLayer.setVisible(true);
    vegetationLayer.setVisible(true);
    updateLegend('combined');
  } else if (currentZoom >= ZOOM_THRESHOLD) {
    // Fort zoom : afficher ad_2018
    adaLayer.setVisible(false);
    adLayer.setVisible(true);
    vegetationLayer.setVisible(false);
    updateLegend('vulnerability');
  } else {
    // Faible zoom : afficher ada_2018
    adaLayer.setVisible(true);
    adLayer.setVisible(false);
    vegetationLayer.setVisible(false);
    updateLegend('vulnerability');
  }
  
  // Mettre à jour les KPI avec les moyennes de la nouvelle couche active
  // SEULEMENT si aucune entité spécifique n'est sélectionnée
  if (!isSpecificEntitySelected) {
    console.log('Changement de couche détecté - mise à jour des moyennes KPI');
    setTimeout(() => {
      updateKpisWithCurrentLayerAverages();
    }, 100); // Petit délai pour laisser les couches se mettre à jour
  }
}

// Écouter les changements de zoom
map.getView().on('change:resolution', updateLayerVisibility);

// Classification de la végétation
function classifyVegetation(pct) {
  if (pct == null || isNaN(pct)) return null;
  const val = Number(pct);
  if (val < 15) return "0-15";
  if (val < 30) return "15-30";
  if (val < 50) return "30-50";
  if (val < 75) return "50-75";
  return "75-100";
}

// Styles des entités
function featureStyle(feature){
  const raw = feature.get("ada_vulnerability_level") || feature.get("ad_vulnerability_level");
  const key = LEVEL_COLORS[raw] ? raw : FR_TO_EN[String(raw||"").toLowerCase()];
  if(!activeLevels.has(key)) return null;
  const color = LEVEL_COLORS[key] || LEVEL_COLORS.average;
  return new ol.style.Style({
    fill:   new ol.style.Fill({ color: hexToRgba(color, 0.55) }),
    stroke: new ol.style.Stroke({ color:"#152042", width:0.8 })
  });
}

function vegetationStyle(feature) {
  const pct = feature.get("vegetation_pct");
  const vegClass = classifyVegetation(pct);

  if (!vegClass || !activeVegetationClasses.has(vegClass)) return null;

  const color = VEGETATION_CLASSES[vegClass].color;

  return new ol.style.Style({
    image: new ol.style.RegularShape({
      points: 4,
      radius: 6,
      angle: Math.PI / 2.5,
      fill: new ol.style.Fill({ color }),
      stroke: new ol.style.Stroke({ color: '#000', width: 1 })
    })
  });
}

function hexToRgba(hex,a=1){ const n=parseInt(hex.replace("#",""),16); return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`; }

// ====== Statistiques de population (dynamique) ======
/** Réinitialise les stats avec les moyennes de la couche active */
function resetPopulationStats() {
  const averages = getAverageKpiData();
  console.log('Réinitialisation des stats de population avec les moyennes:', averages);
  
  // pop_tot = somme réelle de la couche ; les % d'âge = moyennes
  updatePopulationStatsWithData({
    pop_tot: averages.totalPop,
    age_over_65_pct: averages.avgAge65Pct,
    age_over_75_pct: averages.avgAge75Pct,
    age_over_85_pct: averages.avgAge85Pct
  });
}

/** Applique une couleur Bootstrap selon des seuils (%). */
function colorByPct(el, pct) {
  if (!el) return;
  // Nettoie d'abord
  el.classList.remove('text-success', 'text-warning', 'text-danger', 'text-primary');
  if (!(pct != null && isFinite(pct))) { el.classList.add('text-secondary'); return; }

  // Ajuste les seuils si besoin
  if (pct > 35) el.classList.add('text-danger');
  else if (pct > 20) el.classList.add('text-warning');
  else el.classList.add('text-success');
}

/** Récupère un pourcentage depuis un champ % direct ou le calcule à partir d'un compte et du total. */
function getPct(p, pctField, countField, total) {
  const direct = p?.[pctField];
  if (direct != null && isFinite(direct)) return Number(direct);
  const count = p?.[countField] ?? 0;
  if (total > 0) return (Number(count) / Number(total)) * 100;
  return null;
}

/** Met à jour le bloc "Statistiques de population" avec des données spécifiques */
function updatePopulationStatsWithData(data) {
  const el65  = document.getElementById('stat-age-65');
  const el75  = document.getElementById('stat-age-75');
  const el85  = document.getElementById('stat-age-85');
  const elTot = document.getElementById('stat-pop-total');

  if (!el65 || !el75 || !el85 || !elTot) {
    console.error('Éléments DOM des statistiques de population non trouvés');
    return;
  }

  const popTot = Number(data?.pop_tot ?? 0);
  
  // Utilise directement les pourcentages des champs _pct
  const pct65 = Number(data?.age_over_65_pct ?? 0);
  const pct75 = Number(data?.age_over_75_pct ?? 0);
  const pct85 = Number(data?.age_over_85_pct ?? 0);

  // Affichages (format fr-CA)
  elTot.textContent = popTot.toLocaleString('fr-CA');
  el65.textContent  = (pct65 != null && isFinite(pct65)) ? `${pct65.toFixed(1)} %` : 'N/D %';
  el75.textContent  = (pct75 != null && isFinite(pct75)) ? `${pct75.toFixed(1)} %` : 'N/D %';
  el85.textContent  = (pct85 != null && isFinite(pct85)) ? `${pct85.toFixed(1)} %` : 'N/D %';

  // Couleurs par seuils
  colorByPct(el65, pct65);
  colorByPct(el75, pct75);
  colorByPct(el85, pct85);

  // Barres horizontales — animer la largeur de gauche à droite
  requestAnimationFrame(() => {
    const setBar = (id, pct) => {
      const bar = document.getElementById(id);
      if (bar) bar.style.width = (pct != null && isFinite(pct) && pct > 0)
        ? Math.min(pct, 100) + '%'
        : '0%';
    };
    setBar('bar-age-65', pct65);
    setBar('bar-age-75', pct75);
    setBar('bar-age-85', pct85);
  });
}

/** Met à jour le bloc "Statistiques de population" avec la feature sélectionnée. */
function updatePopulationStats(feature) {
  // Si aucune feature n'est sélectionnée, revenir aux moyennes
  if (!feature) {
    resetPopulationStats();
    return;
  }

  const p = feature.getProperties();
  updatePopulationStatsWithData(p);
}


// Gestion dynamique de la légende avec Bootstrap
//updateLegend: met à jour une partie de l'UI ou des indicateurs.
function updateLegend(mode) {
  if (currentLegendMode === mode) return; // Pas de changement

  currentLegendMode = mode;
  const legendSections = document.getElementById("legend-sections");
  const t = TRANSLATIONS[currentLang] || TRANSLATIONS['fr'];

  if (mode === 'combined') {
    legendSections.innerHTML = `
      <!-- Section Vulnérabilité -->
      <div class="legend-section">
        <h3 class="legend-subtitle">
          <i class="fas fa-shield-alt me-1"></i>${t['legend-vuln-title']}
        </h3>
        <label class="legend-item">
          <input type="checkbox" class="form-check-input lvl" value="low" checked>
          <span class="swatch swatch-vulnerability-low"></span> ${t['legend-low']}
        </label>
        <label class="legend-item">
          <input type="checkbox" class="form-check-input lvl" value="average" checked>
          <span class="swatch swatch-vulnerability-average"></span> ${t['legend-average']}
        </label>
        <label class="legend-item">
          <input type="checkbox" class="form-check-input lvl" value="high" checked>
          <span class="swatch swatch-vulnerability-high"></span> ${t['legend-high']}
        </label>
        <label class="legend-item">
          <input type="checkbox" class="form-check-input lvl" value="veryHigh" checked>
          <span class="swatch swatch-vulnerability-veryHigh"></span> ${t['legend-very-high']}
        </label>
      </div>

      <!-- Section Végétation -->
      <div class="legend-section mt-3">
        <h3 class="legend-subtitle">
          <i class="fas fa-leaf me-1"></i>${t['legend-veg-title']}
        </h3>
        ${Object.entries(VEGETATION_CLASSES).map(([key, data]) => `
          <label class="legend-item">
            <input type="checkbox" class="form-check-input veg-lvl" value="${key}" checked>
            <span class="swatch swatch-vegetation-${key} swatch-circle"></span> ${data.label}
          </label>
        `).join('')}
      </div>
    `;
    
    // Ajouter les événements pour les checkboxes de vulnérabilité
    document.querySelectorAll(".lvl").forEach(cb => {
      cb.addEventListener("change", () => {
        if(cb.checked) activeLevels.add(cb.value); 
        else activeLevels.delete(cb.value);
        adLayer.setStyle(featureStyle);
      });
    });
    
    // Ajouter les événements pour les checkboxes de végétation
    document.querySelectorAll(".veg-lvl").forEach(cb => {
      cb.addEventListener("change", () => {
        if(cb.checked) activeVegetationClasses.add(cb.value); 
        else activeVegetationClasses.delete(cb.value);
        vegetationLayer.setStyle(vegetationStyle);
      });
    });
    
  } else if (mode === 'vegetation') {
    legendSections.innerHTML = `
      <div class="legend-section">
        <h3 class="legend-subtitle">
          <i class="fas fa-leaf me-1"></i>${t['legend-veg-title']}
        </h3>
        ${Object.entries(VEGETATION_CLASSES).map(([key, data]) => `
          <label class="legend-item">
            <input type="checkbox" class="form-check-input veg-lvl" value="${key}" checked>
            <span class="swatch swatch-vegetation-${key} swatch-circle"></span> ${data.label}
          </label>
        `).join('')}
      </div>
    `;
    
    // Ajouter les événements pour les checkboxes de végétation
    document.querySelectorAll(".veg-lvl").forEach(cb => {
      cb.addEventListener("change", () => {
        if(cb.checked) activeVegetationClasses.add(cb.value); 
        else activeVegetationClasses.delete(cb.value);
        vegetationLayer.setStyle(vegetationStyle);
      });
    });
    
  } else {
    legendSections.innerHTML = `
      <div class="legend-section">
        <h3 class="legend-subtitle">
          <i class="fas fa-shield-alt me-1"></i>${t['legend-vuln-title']}
        </h3>
        <label class="legend-item">
          <input type="checkbox" class="form-check-input lvl" value="low" checked>
          <span class="swatch swatch-vulnerability-low"></span> ${t['legend-low']}
        </label>
        <label class="legend-item">
          <input type="checkbox" class="form-check-input lvl" value="average" checked>
          <span class="swatch swatch-vulnerability-average"></span> ${t['legend-average']}
        </label>
        <label class="legend-item">
          <input type="checkbox" class="form-check-input lvl" value="high" checked>
          <span class="swatch swatch-vulnerability-high"></span> ${t['legend-high']}
        </label>
        <label class="legend-item">
          <input type="checkbox" class="form-check-input lvl" value="veryHigh" checked>
          <span class="swatch swatch-vulnerability-veryHigh"></span> ${t['legend-very-high']}
        </label>
      </div>
    `;
    
    // Ajouter les événements pour les checkboxes de vulnérabilité
    document.querySelectorAll(".lvl").forEach(cb => {
      cb.addEventListener("change", () => {
        if(cb.checked) activeLevels.add(cb.value); 
        else activeLevels.delete(cb.value);
        adaLayer.setStyle(featureStyle);
        adLayer.setStyle(featureStyle);
      });
    });
  }
}

// Filtres via la légende (version initiale pour vulnérabilité)
document.querySelectorAll("#legend .lvl").forEach(cb=>{
  cb.addEventListener("change", ()=>{
    if(cb.checked) activeLevels.add(cb.value); else activeLevels.delete(cb.value);
    // Mettre à jour le style des deux couches
    adaLayer.setStyle(featureStyle);
    adLayer.setStyle(featureStyle);
  });
});



// Popup attributaire (gestion des trois couches) - Avec Bootstrap


const container = document.getElementById("popup");
const content   = document.getElementById("popup-content");
const closer    = document.getElementById("popup-closer");
/**
 * overlay: Overlay HTML OpenLayers pour afficher la popup.
 */
const overlay   = new ol.Overlay({
  element: container, autoPan:true, autoPanAnimation:{duration:200}, offset:[0,-10]
});
map.addOverlay(overlay);
// Rendre le popup déplaçable (la poignée sera l'entête <h3>)
enablePopupDrag(overlay, map, '.popup-header');

function closePopup(){
  // Arrêter le clignotement
  if (blinkTimer) {
    clearInterval(blinkTimer);
    blinkTimer = null;
  }
  
  overlay.setPosition(undefined);
  container.classList.remove("show");
  closer.blur();
  
  // Remettre le style normal
  if(highlighted){ 
    if (highlighted.get('vegetation_pct') !== undefined) {
      highlighted.setStyle(vegetationStyle(highlighted));
    } else {
      highlighted.setStyle(featureStyle(highlighted));
    }
    highlighted=null; 
  }
}
closer.addEventListener("click",(e)=>{ e.preventDefault(); closePopup(); });
window.addEventListener("keydown",(e)=>{ if(e.key==="Escape") closePopup(); });

let highlighted = null;

map.on("singleclick", (evt) => {
  // Chercher dans les couches actuellement visibles
  const currentZoom = map.getView().getZoom();
  let feat = null;
  let layerType = null;

  if (currentZoom >= ZOOM_VEGETATION) {
    // Mode combiné : priorité aux points de végétation, puis aux zones AD
    feat = map.forEachFeatureAtPixel(evt.pixel, f => f, {
      layerFilter: (l) => l === vegetationLayer
    });
    if (feat) {
      layerType = 'vegetation';
    } else {
      feat = map.forEachFeatureAtPixel(evt.pixel, f => f, {
        layerFilter: (l) => l === adLayer
      });
      layerType = 'vulnerability';
    }
  } else if (currentZoom >= ZOOM_THRESHOLD) {
    feat = map.forEachFeatureAtPixel(evt.pixel, f => f, {
      layerFilter: (l) => l === adLayer
    });
    layerType = 'vulnerability';
  } else {
    feat = map.forEachFeatureAtPixel(evt.pixel, f => f, {
      layerFilter: (l) => l === adaLayer
    });
    layerType = 'vulnerability';
  }

  // ======= CLIC DANS LE VIDE : reset & moyennes =======
  if (!feat) {
    // Ferme le popup
    if (typeof closePopup === 'function') closePopup();

    // Éteindre le cercle de recherche de code postal (s'il existe)
    if (typeof clearPostalCodeSelections === 'function') {
      clearPostalCodeSelections();
    }

    // Stopper le clignotement s'il était actif
    if (typeof blinkTimer !== 'undefined' && blinkTimer) {
      clearInterval(blinkTimer);
      blinkTimer = null;
    }

    // Réinitialiser la surbrillance (et restaurer le style d'origine)
    if (typeof highlighted !== 'undefined' && highlighted) {
      if (highlighted.get && highlighted.get('vegetation_pct') !== undefined) {
        highlighted.setStyle(vegetationStyle(highlighted));
      } else {
        highlighted.setStyle(featureStyle(highlighted));
      }
      highlighted = null;
    }

    // Réafficher les moyennes de la couche active
    currentSelectedFeature = null;
    isSpecificEntitySelected = false;
    console.log('Clic en dehors des entités - réaffichage des moyennes de la couche active');
    if (typeof updateKpisWithCurrentLayerAverages === 'function') {
      updateKpisWithCurrentLayerAverages(); 
    }

    // Réinitialiser les champs résidentiels
    if (typeof updateResidentialFields === 'function') {
      updateResidentialFields(null);
    }

    // METTRE À JOUR LE GRAPHIQUE
    if (typeof updateSocioEconomicChart === 'function') {
      updateSocioEconomicChart(null);
    }

    // Réinitialiser le bloc Statistiques de population
    if (typeof updatePopulationStats === 'function') {
      updatePopulationStats(null);
    }

    // Vider le champ de code postal
    const postalCodeInput = document.getElementById('postal-code-search');
    if (postalCodeInput) {
      postalCodeInput.value = '';
    }

    // Réinitialiser la dernière recherche si utilisée
    if (typeof lastSearchedPostalCode !== 'undefined') {
      lastSearchedPostalCode = null;
    }

    return;
  }

  // ======= CLIC SUR UNE ENTITÉ : sélectionner + mettre à jour KPIs & stats =======

  // Sélection (popup, style, etc.)
  if (typeof selectFeature === 'function') {
    selectFeature(feat, layerType, evt.coordinate);
  }

  // Mettre à jour KPIs avec jointure si nécessaire (retourne la feature agrégée)
  let featureForKpis = feat;
  if (typeof updateKpisWithJoin === 'function') {
    featureForKpis = updateKpisWithJoin(feat, layerType) || null;
  }

  // Mettre à jour le bloc "Statistiques de population"
  if (typeof updatePopulationStats === 'function') {
    updatePopulationStats(featureForKpis);
  }
});


/**
 * row: Helper: construit une ligne clé/valeur pour le popup.
 */
function row(k,v){ return `<div class="kv"><span class="fw-medium">${k}</span><span>${v ?? "—"}</span></div>`; }
function rowRatio(k,val,total){ return `<div class="kv"><span class="fw-medium">${k}</span><span>${fmtNum(val)} / ${fmtNum(total)}</span></div>`; }
/**
 * fmtNum: Helper: formate un nombre avec la locale fr-CA.
 */
function fmtNum(n){ return (n==null) ? "—" : Number(n).toLocaleString("fr-CA"); }
/**
 * fmtPct: Helper: formate un pourcentage (0—1 ou 0—100) en 'xx.x %'.
 */
function fmtPct(p){ if(p==null) return "—"; const v=Number(p); return (v<=1? v*100:v).toFixed(1)+" %"; }
/**
 * labelFromLevel: Helper: convertit un niveau en badge Bootstrap coloré.
 */
function labelFromLevel(raw){
  if(!raw) return "—";
  const key = LEVEL_COLORS[raw] ? raw : FR_TO_EN[String(raw).toLowerCase()];
  const t = TRANSLATIONS[currentLang] || TRANSLATIONS['fr'];
  const L = {
    veryLow:  t['level-very-low'],
    low:      t['level-low'],
    average:  t['level-average'],
    high:     t['level-high'],
    veryHigh: t['level-very-high']
  };
  const label = L[key] || raw;
  const bgColor = LEVEL_COLORS[key] || "#6c757d";
  const textColor = (key === "average") ? "#1a1a1a" : "#ffffff"; // ambre : texte sombre
  return `<span class="badge" style="background:${bgColor};color:${textColor};font-weight:600;">${label}</span>`;
}

// Survol des entités (gestion des trois couches)
let hoverFeature = null;
const hoverStyle = new ol.style.Style({
  stroke:new ol.style.Stroke({ color:"#ffffff", width:2 }),
  fill:new ol.style.Fill({ color:"rgba(255,255,255,0.0001)" })
});

const hoverVegetationStyle = new ol.style.Style({
  image: new ol.style.Circle({
    radius: 6,
    fill: new ol.style.Fill({ color: 'rgba(255,255,255,0.3)' }),
    stroke: new ol.style.Stroke({ color: '#ffffff', width: 2 })
  })
});

map.on("pointermove", (evt) => {
  if (evt.dragging) return;

  // Vérifier dans les couches actuellement visibles
  const currentZoom = map.getView().getZoom();
  let hit = false;
  
  if (currentZoom >= ZOOM_VEGETATION) {
    // Mode combiné : vérifier végétation puis zones AD
    hit = map.hasFeatureAtPixel(evt.pixel, { layerFilter: (l) => l === vegetationLayer }) ||
          map.hasFeatureAtPixel(evt.pixel, { layerFilter: (l) => l === adLayer });
  } else if (currentZoom >= ZOOM_THRESHOLD) {
    hit = map.hasFeatureAtPixel(evt.pixel, { layerFilter: (l) => l === adLayer });
  } else {
    hit = map.hasFeatureAtPixel(evt.pixel, { layerFilter: (l) => l === adaLayer });
  }
  
  map.getTargetElement().style.cursor = hit ? "pointer" : "default";

  // Gestion du survol
  let feat = null;
  let isVegetation = false;
  
  if (currentZoom >= ZOOM_VEGETATION) {
    // Priorité aux points de végétation
    feat = map.forEachFeatureAtPixel(evt.pixel, f => f, { 
      layerFilter: (l) => l === vegetationLayer 
    });
    if (feat) {
      isVegetation = true;
    } else {
      feat = map.forEachFeatureAtPixel(evt.pixel, f => f, { 
        layerFilter: (l) => l === adLayer 
      });
    }
  } else if (currentZoom >= ZOOM_THRESHOLD) {
    feat = map.forEachFeatureAtPixel(evt.pixel, f => f, { 
      layerFilter: (l) => l === adLayer 
    });
  } else {
    feat = map.forEachFeatureAtPixel(evt.pixel, f => f, { 
      layerFilter: (l) => l === adaLayer 
    });
  }

  if (hoverFeature && hoverFeature !== highlighted) {
    if (hoverFeature.get('vegetation_pct') !== undefined) {
      hoverFeature.setStyle(vegetationStyle(hoverFeature));
    } else {
      hoverFeature.setStyle(featureStyle(hoverFeature));
    }
    hoverFeature = null;
  }
  
  if (feat && feat !== highlighted) {
    hoverFeature = feat;
    if (isVegetation) {
      feat.setStyle(hoverVegetationStyle);
    } else {
      feat.setStyle(hoverStyle);
    }
  }
});

// Panneau latéral : ouvrir/fermer avec Bootstrap
const appMain  = document.getElementById("app-main");
const toggleBtn = document.getElementById("panel-toggle");
const saved = localStorage.getItem("panel_open");
setPanel(saved !== "false");

toggleBtn.addEventListener("click", ()=>{
  const open = toggleBtn.getAttribute("aria-expanded") !== "false";
  setPanel(!open);
});

function setPanel(open){
  appMain.classList.toggle("panel-collapsed", !open);
  toggleBtn.classList.toggle("panel-collapsed", !open);
  toggleBtn.setAttribute("aria-expanded", String(open));
  
  toggleBtn.setAttribute("data-tip", open ? "Masquer le panneau" : "Afficher le panneau");
  
  localStorage.setItem("panel_open", String(open));
  map.updateSize();
}

// Contrôle "Re-localiser" (retour à l'emprise des données)
class RecenterControl extends ol.control.Control {
  constructor() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.title = "Re-localiser la carte";
    btn.setAttribute("aria-label","Re-localiser la carte");
    btn.className = "btn btn-primary";

    const img = document.createElement("img");
    img.src = "images/points-focaux.png"; // icône fournie
    img.alt = "";
    img.onerror = () => { btn.innerHTML = '<i class="fas fa-crosshairs"></i>'; }; // fallback Font Awesome
    btn.appendChild(img);

    const el = document.createElement("div");
    el.className = "ol-unselectable ol-control recenter";
    el.appendChild(btn);

    super({ element: el });

    btn.addEventListener("click", () => {
      const v = map.getView();
      if (initialExtent && isFinite(initialExtent[0])) {
        v.setRotation(0);
        v.fit(initialExtent, {
          padding: [30, 30, 100, 100],
          maxZoom: 11,
          duration: 350
        });
      }
    });
  }
}
map.addControl(new RecenterControl());

// Contrôle "Ma position" avec Bootstrap
class LocateControl extends ol.control.Control {
  constructor() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.title = 'Ma position';
    btn.setAttribute('aria-label', 'Localiser ma position');
    btn.className = "btn btn-primary";

    // icône image (fallback Font Awesome si image ne charge pas)
    const img = document.createElement('img');
    img.src = 'images/emplacement.png';    // Chemin mis à jour
    img.alt = '';
    img.onerror = () => { btn.innerHTML = '<i class="fas fa-location-dot"></i>'; }; // fallback Font Awesome
    btn.appendChild(img);

    const el = document.createElement('div');
    el.className = 'ol-unselectable ol-control locate';
    el.appendChild(btn);
    super({ element: el });

    // --- couche d'affichage
/**
 * userSource: source vecteur OpenLayers (données en mémoire).
 */
    const userSource = new ol.source.Vector();
/**
 * userLayer: couche OpenLayers affichée sur la carte.
 */
    const userLayer  = new ol.layer.Vector({
      source: userSource,
      zIndex: 9999,
      style: (f) => {
        if (f.get('type') === 'accuracy') {
          return new ol.style.Style({
            fill:  new ol.style.Fill({ color: 'rgba(0,120,255,0.15)' }),
            stroke:new ol.style.Stroke({ color: 'rgba(0,120,255,0.45)', width: 1 })
          });
        }
        return new ol.style.Style({
          image: new ol.style.Circle({
            radius: 6,
            fill:   new ol.style.Fill({ color: '#1e90ff' }),
            stroke: new ol.style.Stroke({ color: '#ffffff', width: 2 })
          })
        });
      }
    });
    map.addLayer(userLayer);

    // --- géolocalisation
    const geoloc = new ol.Geolocation({
      projection: map.getView().getProjection(),
      tracking: false,
      trackingOptions: { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    });

    geoloc.on('change', () => {
      const p = geoloc.getPosition();
      const acc = geoloc.getAccuracy();
      console.log('[GEO] pos=', p, 'acc=', acc);

      if (!p) return;

      // point
      let pt = userSource.getFeatures().find(ft => ft.get('type') === 'point');
      if (!pt) { pt = new ol.Feature({ type: 'point' }); userSource.addFeature(pt); }
      pt.setGeometry(new ol.geom.Point(p));

      // cercle (mètres en EPSG:3857)
      if (acc && isFinite(acc)) {
        let ac = userSource.getFeatures().find(ft => ft.get('type') === 'accuracy');
        if (!ac) { ac = new ol.Feature({ type: 'accuracy' }); userSource.addFeature(ac); }
        ac.setGeometry(new ol.geom.Circle(p, acc));
      }

      // vue
      const v = map.getView();
      v.setRotation(0);
      v.animate({ center: p, zoom: Math.max(v.getZoom() ?? 0, 15), duration: 350 });
    });

    geoloc.on('error', (e) => {
      console.warn('[GEO] error:', e.message);
      // Utilisation d'une alerte Bootstrap plus élégante
      const alertDiv = document.createElement('div');
      alertDiv.className = 'alert alert-warning alert-dismissible fade show position-fixed';
      alertDiv.style.cssText = 'top: 20px; right: 20px; z-index: 9999; max-width: 350px;';
      alertDiv.innerHTML = `
        <i class="fas fa-exclamation-triangle me-2"></i>
        <strong>Géolocalisation impossible</strong><br>
        Assurez-vous d'être en HTTPS et d'avoir autorisé la localisation.
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
      `;
      document.body.appendChild(alertDiv);
      
      // Auto-suppression après 5 secondes
      setTimeout(() => {
        if (alertDiv.parentNode) {
          alertDiv.remove();
        }
      }, 5000);
    });

    btn.addEventListener('click', () => {
      const secure = location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

      if (!secure) {
        // Utilisation d'une alerte Bootstrap
        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert alert-danger alert-dismissible fade show position-fixed';
        alertDiv.style.cssText = 'top: 20px; right: 20px; z-index: 9999; max-width: 350px;';
        alertDiv.innerHTML = `
          <i class="fas fa-lock me-2"></i>
          <strong>HTTPS requis</strong><br>
          La géolocalisation nécessite HTTPS (ou localhost).
          <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        document.body.appendChild(alertDiv);
        return;
      }

      console.log('[GEO] start tracking');
      geoloc.setTracking(true);

      // stop après 6s pour ne pas suivre en continu
      clearTimeout(this._stopTimer);
      this._stopTimer = setTimeout(() => {
        console.log('[GEO] stop tracking');
        geoloc.setTracking(false);
      }, 6000);
    });
  }
}

map.addControl(new LocateControl());

/* ===== Système de traduction FR / EN ===== */

let currentLang = localStorage.getItem('dashboard-lang') || 'fr';

const TRANSLATIONS = {
  fr: {
    'header-title':                'Vulnérabilité au changement climatique à Montréal',
    'lang-btn':                    'EN',
    'info-btn-title':              'À propos',
    'dark-btn-title':              'Mode sombre',
    // KPI
    'kpi-pop-lico-label':          'Pop à faible revenu',
    'kpi-pop-no-degree-label':     'Pop sans diplôme',
    'kpi-household-renter-label':  'Ménages locataires',
    'kpi-household-one-person-label': "Ménages d'une seule personne",
    // Panneau gauche
    'residential-title':           'Taille Résidentielle',
    'postal-code-label':           'Code postal',
    'postal-code-placeholder':     'Entrez votre code postal \nEX : H1L1L7',
    'division-area-label':         "Code de l'Aire de Division",
    'aggregated-division-label':   'Code Aaire de Division Agrégée',
    'veg-units-label':             'Unités avec végétation >30%',
    'veg-units-suffix':            'unités',
    'veg-pct-label':               'Pourcentage de végétation %',
    'soc-eco-title':               'Profil socioéconomique',
    'pop-stats-title':             'Statistiques de population',
    'stat-age-65-label':           'âgée 65 ans +',
    'stat-age-75-label':           'âgée 75 ans +',
    'stat-age-85-label':           'âgée 85 ans +',
    'stat-pop-total-label':        'totale',
    // Légende
    'legend-title':                'Légende',
    'legend-vuln-title':           'Vulnérabilité',
    'legend-veg-title':            'Végétation',
    'legend-low':                  'Faible',
    'legend-average':              'Moyen',
    'legend-high':                 'Élevé',
    'legend-very-high':            'Très élevé',
    // Fond de carte
    'basemap-title':               'Fonds<br>de<br>carte',
    'basemap-library-title':       'Bibliothèque de fonds de carte',
    // Simulateur
    'simulator-title':             'Simulateur de scénarios de vulnérabilité',
    'year-label':                  '📅 Année de simulation (2018 → 2095)',
    'ssp-label':                   '🌡️ Scénario socio-économique partagé (SSP)',
    'ssp-historical-label':        'Historique (2018)',
    'ssp-ssp126-label':            'développement durable',
    'ssp-ssp245-label':            'scénario intermédiaire (modéré)',
    'ssp-ssp585-label':            'croissance intensive',
    'aging-label':                 "👥 Scénario d'évolution démographique",
    'aging-historical-label':      'Historique (2018)',
    'aging-younger-label':         'Population Plus Jeune',
    'aging-intermediate-label':    'Population Intermédiaire',
    'aging-older-label':           'Vieillissement accéléré',
    'reset-btn':                   '🔄 Réinitialiser',
    // Graphiques
    'temp-chart-title':            'Variations de Température',
    'temp-chart-main-title':       'Température',
    'temp-yaxis':                  'Température (°C)',
    'temp-xaxis':                  'Mai - Septembre',
    'mortality-chart-title':       'Taux de Mortalité Prédits',
    'mortality-chart-main-title':  'Mortalité',
    'mortality-yaxis':             'Taux de mortalité / 10 000 personnes',
    // Dropdown – textes d'état
    'dropdown-none':               'Aucune sélection',
    'dropdown-many':               '{n} éléments sélectionnés',
    // Modal info
    'info-modal-title':            'À propos du tableau de bord',
    'info-section-about-title':    'Description',
    'info-section-about-text':     "Ce tableau de bord interactif visualise la vulnérabilité des quartiers de Montréal face aux changements climatiques. Il combine des données socioéconomiques, démographiques et environnementales pour évaluer les risques par secteur géographique (Aire de Diffusion).",
    'info-section-data-title':     'Données',
    'info-data-1':                 'Données socioéconomiques : Recensement Statistics Canada 2016/2021',
    'info-data-2':                 'Végétation urbaine : Analyse télédétection 2018',
    'info-data-3':                 'Projections climatiques : Scénarios SSP (GIEC) 2031–2095',
    'info-data-4':                 'Mortalité : Modèles prédictifs basés sur données historiques',
    'info-section-usage-title':    'Comment utiliser',
    'info-usage-1':                'Cliquez sur un secteur de la carte pour voir ses indicateurs détaillés',
    'info-usage-2':                'Entrez un code postal pour localiser une adresse précise',
    'info-usage-3':                'Utilisez le simulateur (panneau droit) pour explorer différents scénarios futurs',
    'info-usage-4':                'Filtrez les niveaux de vulnérabilité via la légende de la carte',
    'info-usage-5':                'Changez le fond de carte selon vos préférences',
    'info-section-vuln-title':     'Niveaux de vulnérabilité',
    'info-footer':                 'Tableau de bord de vulnérabilité climatique – Montréal',
    'info-close-btn':              'Fermer',
    // Popup — végétation
    'popup-veg-title':             'Végétation',
    'popup-veg-postal':            'Code postal',
    'popup-veg-dauid':             "Code de l'Aire de Division",
    'popup-veg-adauid':            'Aire de Division Agrégée',
    'popup-veg-units':             "Nombre d'unités",
    'popup-veg-units30':           'Unités avec végétation >30%',
    'popup-veg-pct':               'Pourcentage de végétation',
    'popup-veg-level':             'Niveau de vulnérabilité',
    'popup-gmaps':                 'Voir sur Google Maps',
    // Popup — vulnérabilité
    'popup-vuln-level':            'Niveau de vulnérabilité',
    'popup-pop-total':             'Population totale',
    'popup-pop-65':                'Population âgée 65 ans +',
    'popup-pop-75':                'Population âgée 75 ans +',
    'popup-pop-85':                'Population âgée 85 ans +',
    'popup-pop-lico':              'Population à faible revenu',
    'popup-pop-nodeg':             'Population sans diplôme',
    'popup-household-tot':         'Nombre total de ménages',
    'popup-household-renter':      'Ménages locataires',
    'popup-household-one':         "Ménages d'une seule personne",
    'popup-units-tot':             "Nombre d'unités total",
    'popup-units-veg':             'Unités avec végétation >30%',
    'popup-pct-veg':               'Pourcentage de végétation',
    'popup-more':                  'Voir plus',
    'popup-less':                  'Voir moins',
    // Labels de niveau (badge)
    'level-very-low':              'Très faible',
    'level-low':                   'Faible',
    'level-average':               'Moyen',
    'level-high':                  'Élevé',
    'level-very-high':             'Très élevé',
    // Alertes code postal
    'alert-postal-invalid':        'Insérer un code postal valide à la ville de Montréal sous format (A1A1A1).',
    'alert-postal-no-data':        "Les données d'adresses ne sont pas chargées.",
    'alert-postal-found':          'Code postal trouvé et sélectionné sur la carte',
    // Labels graphique socio-éco
    'chart-65':                    '65 ans+',
    'chart-75':                    '75 ans+',
    'chart-85':                    '85 ans+',
    'chart-lico':                  'Faible\nrevenu',
    'chart-nodeg':                 'Sans\ndiplôme',
    'chart-65-tooltip':            'Population 65 ans et plus',
    'chart-75-tooltip':            'Population 75 ans et plus',
    'chart-85-tooltip':            'Population 85 ans et plus',
    'chart-lico-tooltip':          'Population à faible revenu',
    'chart-nodeg-tooltip':         'Population sans diplôme',
    'chart-count-label':           'Nombre',
    'chart-pct-label':             'Pourcentage',
  },
  en: {
    'header-title':                'Climate Change Vulnerability in Montréal',
    'lang-btn':                    'FR',
    'info-btn-title':              'About',
    'dark-btn-title':              'Dark mode',
    // KPI
    'kpi-pop-lico-label':          'Low-income Pop.',
    'kpi-pop-no-degree-label':     'Pop. without degree',
    'kpi-household-renter-label':  'Renter households',
    'kpi-household-one-person-label': 'Single-person households',
    // Left panel
    'residential-title':           'Residential Size',
    'postal-code-label':           'Postal code',
    'postal-code-placeholder':     'Enter your postal code\n (EXP: H1L1L7)',
    'division-area-label':         'Division Area Code',
    'aggregated-division-label':   'Aggregated Division Area Code',
    'veg-units-label':             'Units with vegetation >30%',
    'veg-units-suffix':            'units',
    'veg-pct-label':               'Vegetation percentage %',
    'soc-eco-title':               'Socioeconomic Profile',
    'pop-stats-title':             'Population Statistics',
    'stat-age-65-label':           'aged 65+',
    'stat-age-75-label':           'aged 75+',
    'stat-age-85-label':           'aged 85+',
    'stat-pop-total-label':        'total',
    // Legend
    'legend-title':                'Legend',
    'legend-vuln-title':           'Vulnerability',
    'legend-veg-title':            'Vegetation',
    'legend-low':                  'Low',
    'legend-average':              'Average',
    'legend-high':                 'High',
    'legend-very-high':            'Very High',
    // Basemap
    'basemap-title':               'Base<br>Maps',
    'basemap-library-title':       'Basemap Library',
    // Simulator
    'simulator-title':             'Vulnerability Scenario Simulator',
    'year-label':                  '📅 Simulation year (2018 → 2095)',
    'ssp-label':                   '🌡️ Shared Socioeconomic Pathway (SSP)',
    'ssp-historical-label':        'Historical (2018)',
    'ssp-ssp126-label':            'Sustainable development',
    'ssp-ssp245-label':            'Intermediate scenario (moderate)',
    'ssp-ssp585-label':            'Intensive growth',
    'aging-label':                 '👥 Demographic evolution scenario',
    'aging-historical-label':      'Historical (2018)',
    'aging-younger-label':         'Younger Population',
    'aging-intermediate-label':    'Intermediate Population',
    'aging-older-label':           'Accelerated aging',
    'reset-btn':                   '🔄 Reset',
    // Charts
    'temp-chart-title':            'Temperature Variations',
    'temp-chart-main-title':       'Temperature',
    'temp-yaxis':                  'Temperature (°C)',
    'temp-xaxis':                  'May - September',
    'mortality-chart-title':       'Predicted Mortality Rates',
    'mortality-chart-main-title':  'Mortality',
    'mortality-yaxis':             'Mortality rate / 10,000 persons',
    // Dropdown status text
    'dropdown-none':               'No selection',
    'dropdown-many':               '{n} items selected',
    // Info modal
    'info-modal-title':            'About the Dashboard',
    'info-section-about-title':    'Description',
    'info-section-about-text':     'This interactive dashboard visualizes the vulnerability of Montréal neighbourhoods to climate change. It combines socioeconomic, demographic and environmental data to assess risks by geographic sector (Dissemination Area).',
    'info-section-data-title':     'Data',
    'info-data-1':                 'Socioeconomic data: Statistics Canada Census 2016/2021',
    'info-data-2':                 'Urban vegetation: Remote sensing analysis 2018',
    'info-data-3':                 'Climate projections: SSP scenarios (IPCC) 2031–2095',
    'info-data-4':                 'Mortality: Predictive models based on historical data',
    'info-section-usage-title':    'How to use',
    'info-usage-1':                'Click on a map sector to see its detailed indicators',
    'info-usage-2':                'Enter a postal code to locate a specific address',
    'info-usage-3':                'Use the simulator (right panel) to explore different future scenarios',
    'info-usage-4':                'Filter vulnerability levels using the map legend',
    'info-usage-5':                'Change the basemap to your preference',
    'info-section-vuln-title':     'Vulnerability levels',
    'info-footer':                 'Climate vulnerability dashboard – Montréal',
    'info-close-btn':              'Close',
    // Socio-eco chart labels
    'chart-65':                    '65+',
    'chart-75':                    '75+',
    'chart-85':                    '85+',
    'chart-lico':                  'Low\nincome',
    'chart-nodeg':                 'No\ndegree',
    'chart-65-tooltip':            'Population aged 65 and over',
    'chart-75-tooltip':            'Population aged 75 and over',
    'chart-85-tooltip':            'Population aged 85 and over',
    'chart-lico-tooltip':          'Low-income population',
    'chart-nodeg-tooltip':         'Population without degree',
    'chart-count-label':           'Count',
    'chart-pct-label':             'Percentage',
    // Popup — vegetation
    'popup-veg-title':             'Vegetation',
    'popup-veg-postal':            'Postal code',
    'popup-veg-dauid':             'Division Area Code',
    'popup-veg-adauid':            'Aggregated Division Area',
    'popup-veg-units':             'Number of units',
    'popup-veg-units30':           'Units with vegetation >30%',
    'popup-veg-pct':               'Vegetation percentage',
    'popup-veg-level':             'Vulnerability level',
    'popup-gmaps':                 'View on Google Maps',
    // Popup — vulnerability
    'popup-vuln-level':            'Vulnerability level',
    'popup-pop-total':             'Total population',
    'popup-pop-65':                'Population aged 65+',
    'popup-pop-75':                'Population aged 75+',
    'popup-pop-85':                'Population aged 85+',
    'popup-pop-lico':              'Low-income population',
    'popup-pop-nodeg':             'Population without degree',
    'popup-household-tot':         'Total number of households',
    'popup-household-renter':      'Renter households',
    'popup-household-one':         'One-Person Households',
    'popup-units-tot':             'Total number of units',
    'popup-units-veg':             'Units with vegetation >30%',
    'popup-pct-veg':               'Vegetation percentage',
    'popup-more':                  'See more',
    'popup-less':                  'See less',
    // Level labels (badge)
    'level-very-low':              'Very low',
    'level-low':                   'Low',
    'level-average':               'Average',
    'level-high':                  'High',
    'level-very-high':             'Very high',
    // Postal code alerts
    'alert-postal-invalid':        'Please enter a valid Montréal postal code in the format (A1A1A1).',
    'alert-postal-no-data':        'Address data is not loaded.',
    'alert-postal-found':          'Postal code found and selected on the map',
  }
};

/**
 * Applique les traductions de la langue choisie sur tous les éléments [data-i18n].
 */
function applyTranslations(lang) {
  const t = TRANSLATIONS[lang] || TRANSLATIONS['fr'];

  // Texte simple
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (t[key] !== undefined) {
      el.textContent = t[key];
    }
  });

  // Contenu HTML (ex : balises <br>)
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.getAttribute('data-i18n-html');
    if (t[key] !== undefined) {
      el.innerHTML = t[key];
    }
  });

  // Placeholder d'inputs
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (t[key] !== undefined) {
      el.placeholder = t[key];
    }
  });

  // Attribut title des boutons
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    if (t[key] !== undefined) {
      el.title = t[key];
    }
  });

  // Mettre à jour la langue HTML du document
  document.documentElement.lang = lang;

  // Rafraîchir le texte affiché dans les dropdowns
  ['years', 'ssp', 'aging'].forEach(type => updateDropdownText(type));

  // Mettre à jour les labels du graphique socio-éco si initialisé
  if (socioEconomicChart) {
    socioEconomicChart.setOption({
      xAxis: {
        data: [t['chart-65'], t['chart-75'], t['chart-85'], t['chart-lico'], t['chart-nodeg']]
      }
    });
  }

  // Re-rendre la légende avec la nouvelle langue
  const savedMode = currentLegendMode;
  currentLegendMode = null; // forcer la mise à jour
  updateLegend(savedMode);
}

/* ===== Lang switch avec Bootstrap ===== */
document.getElementById("lang-toggle").addEventListener("click", function() {
  currentLang = currentLang === 'fr' ? 'en' : 'fr';
  localStorage.setItem('dashboard-lang', currentLang);
  applyTranslations(currentLang);
  if (isDataLoaded) updateAllCharts();
});

// Appliquer la langue sauvegardée au chargement
applyTranslations(currentLang);

/* ===== Mode sombre ===== */
let isDarkMode = localStorage.getItem('dashboard-dark') === 'true';

function applyDarkMode(enabled) {
  if (enabled) {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }
  localStorage.setItem('dashboard-dark', enabled);
}

document.getElementById("dark-mode-toggle").addEventListener("click", function() {
  isDarkMode = !isDarkMode;
  applyDarkMode(isDarkMode);
  // Re-rendre les graphiques avec les couleurs du nouveau thème
  if (socioEconomicChart) updateSocioEconomicChart(null);
  if (isDataLoaded) updateAllCharts();
});

// Appliquer le mode sauvegardé au chargement
applyDarkMode(isDarkMode);

// Initialisation des événements pour la section résidentielle
const postalSearchInput = document.getElementById('postal-code-search');
/**
 * searchButton: recherche/filtrage de données.
 */
const searchButton = document.getElementById('search-postal-btn');

if (postalSearchInput && searchButton) {
  // Recherche au clic sur le bouton
  searchButton.addEventListener('click', function() {
    const postalCode = postalSearchInput.value.trim();
    searchByPostalCode(postalCode);
  });
  
  // Recherche avec la touche Entrée
  postalSearchInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      const postalCode = postalSearchInput.value.trim();
      searchByPostalCode(postalCode);
    }
  });
  
  // Validation en temps réel du format (seulement lettres et chiffres, 6 caractères max)
  postalSearchInput.addEventListener('input', function(e) {
    const cursorPosition = e.target.selectionStart;
    let value = e.target.value.toUpperCase();
    
    // Ne garder que les lettres et chiffres (format canadien A1A1A1)
    value = value.replace(/[^A-Z0-9]/g, '');
    
    // Limiter à 6 caractères maximum
    if (value.length > 6) {
      value = value.substring(0, 6);
    }
    
    // Appliquer la valeur filtrée
    e.target.value = value;
    
    // Rétablir la position du curseur
    const newCursorPosition = Math.min(cursorPosition, value.length);
    setTimeout(() => {
      e.target.setSelectionRange(newCursorPosition, newCursorPosition);
    }, 0);
  });
}

// Initialisation terminée
console.log("Dashboard Bootstrap avec moyennes intelligentes, jointure par attributs, section résidentielle et clignotement chargé avec succès!");

// Variables globales pour les instances des jauges
let kpiGauges = {
  popLico: null,
  popNoDegree: null,
  householdRenter: null,
  householdOnePerson: null
};

// Configuration des seuils pour chaque jauge
const GAUGE_THRESHOLDS = {
  popLico: { warning: 10, danger: 20 },
  popNoDegree: { warning: 15, danger: 30 },
  householdRenter: { warning: 50, danger: 70 },
  householdOnePerson: { warning: 25, danger: 40 }
};

// Fonction pour déterminer la couleur selon les seuils
function getGaugeColor(value, type) {
  const thresholds = GAUGE_THRESHOLDS[type];
  if (value >= thresholds.danger) return '#dc3545';   // Rouge
  if (value >= thresholds.warning) return '#ffc107';  // Orange
  return '#198754';  // Vert
}

// Fonction pour créer une jauge ECharts fer à cheval (style moderne)
function createGauge(containerId, type, value = 0) {
  const chartDom = document.getElementById(containerId);
  if (!chartDom) {
    console.error(`Conteneur ${containerId} non trouvé`);
    return null;
  }

  const chart = echarts.init(chartDom);
  const color = getGaugeColor(value, type);

  chart.setOption({
    animation: true,
    animationDuration: 1100,
    animationEasing: 'cubicOut',
    series: [{
      type: 'gauge',
      startAngle: 200,
      endAngle: -20,
      min: 0,
      max: 100,
      radius: '96%',
      center: ['50%', '70%'],
      itemStyle: {
        color: color,
        shadowColor: color,
        shadowBlur: 12
      },
      progress: {
        show: true,
        roundCap: true,
        width: 9
      },
      pointer: { show: false },
      axisLine: {
        roundCap: true,
        lineStyle: {
          width: 9,
          color: [[1, 'rgba(0,0,0,0.08)']]
        }
      },
      axisTick:  { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      title:     { show: false },
      detail: {
        show: true,
        offsetCenter: [0, '10%'],
        valueAnimation: true,
        formatter: v => v.toFixed(1) + '%',
        fontSize: 12,
        fontWeight: 'bold',
        fontFamily: "'Inter', sans-serif",
        color: color
      },
      data: [{ value: value }]
    }]
  });

  return chart;
}

// Fonction pour mettre à jour une jauge ECharts
function updateGauge(chart, type, value) {
  if (!chart) return;
  const color = getGaugeColor(value, type);
  chart.setOption({
    series: [{
      itemStyle: { color: color, shadowColor: color, shadowBlur: 12 },
      detail:    { color: color },
      data:      [{ value: value }]
    }]
  });
}

// Initialisation des 4 jauges
function initKpiGauges() {
  console.log('Initialisation des jauges KPI...');
  
  kpiGauges.popLico = createGauge('gauge-pop-lico', 'popLico');
  kpiGauges.popNoDegree = createGauge('gauge-pop-no-degree', 'popNoDegree');
  kpiGauges.householdRenter = createGauge('gauge-household-renter', 'householdRenter');
  kpiGauges.householdOnePerson = createGauge('gauge-household-one-person', 'householdOnePerson');
  
  console.log('Jauges initialisées:', kpiGauges);
}

// Mise à jour des jauges avec les moyennes
function updateKpiGaugesWithAverages() {
  const averages = getAverageKpiData();
  console.log('Mise à jour des jauges avec moyennes:', averages);
  
  if (kpiGauges.popLico) {
    updateGauge(kpiGauges.popLico, 'popLico', averages.avgPopLicoPct || 0);
  }
  if (kpiGauges.popNoDegree) {
    updateGauge(kpiGauges.popNoDegree, 'popNoDegree', averages.avgPopNoDegreePct || 0);
  }
  if (kpiGauges.householdRenter) {
    updateGauge(kpiGauges.householdRenter, 'householdRenter', averages.avgHouseholdRenterPct || 0);
  }
  if (kpiGauges.householdOnePerson) {
    updateGauge(kpiGauges.householdOnePerson, 'householdOnePerson', averages.avgHouseholdOnePersonPct || 0);
  }
}

// Mise à jour des jauges avec une feature spécifique
function updateKpiGaugesWithFeature(feature) {
  if (!feature) {
    updateKpiGaugesWithAverages();
    return;
  }
  
  const properties = feature.getProperties();
  
  if (kpiGauges.popLico) {
    const value = Number(properties.pop_lico_at_pct || 0);
    updateGauge(kpiGauges.popLico, 'popLico', value);
  }
  
  if (kpiGauges.popNoDegree) {
    const value = Number(properties.pop_no_degree_pct || 0);
    updateGauge(kpiGauges.popNoDegree, 'popNoDegree', value);
  }
  
  if (kpiGauges.householdRenter) {
    const value = Number(properties.household_renter_pct || 0);
    updateGauge(kpiGauges.householdRenter, 'householdRenter', value);
  }
  
  if (kpiGauges.householdOnePerson) {
    const value = Number(properties.household_one_person_pct || 0);
    updateGauge(kpiGauges.householdOnePerson, 'householdOnePerson', value);
  }
}

// Redimensionnement des jauges
function resizeKpiGauges() {
  Object.values(kpiGauges).forEach(gauge => {
    if (gauge) gauge.resize();
  });
}

// Initialisation au chargement
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(() => {
    initKpiGauges();
    updateKpiGaugesWithAverages();
  }, 1500);
});

// Redimensionnement lors du changement de taille
window.addEventListener('resize', resizeKpiGauges);


/* ===== Section Température & Mortalité avec ECharts ===== */
// === Variables globales ===
let rawData = [];
let chart;
let mortalityChart;
let isDataLoaded = false;
let isSimulatorExpanded = false;

// === Thème couleurs selon mode sombre/clair ===
function getChartTheme() {
  const dark = document.body.classList.contains('dark-mode');
  return {
    textColor:      dark ? '#cbd5e1' : '#666',
    titleColor:     dark ? '#e2e8f0' : '#2c3e50',
    axisLineColor:  dark ? '#334155' : '#ddd',
    splitLineColor: dark ? '#1e293b' : '#f0f0f0',
    tooltipBg:      dark ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.95)',
    tooltipBorder:  dark ? '#334155' : '#ddd',
    tooltipText:    dark ? '#e2e8f0' : '#333'
  };
}

// === Palette de couleurs pour les années ===
const yearColors = [
    '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', 
    '#1abc9c', '#e67e22', '#34495e', '#f1c40f', '#8e44ad', 
    '#95a5a6', '#d35400', '#27ae60', '#2980b9', '#8e44ad',
    '#16a085', '#c0392b', '#d68910', '#7d3c98', '#138d75', '#a93226'
];

// === Initialisation au chargement de la page ===
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initialisation de l\'application...');
    initCharts();
    loadData();
    setupEventListeners();
    initLegendScaler();
});

// === Scaler adaptatif — légende + contrôles de la carte ===
function initLegendScaler() {
    const mapEl = document.getElementById('map');
    if (!mapEl) return;

    // Largeur de référence : taille "normale" du conteneur carte (px)
    const REF_WIDTH = 780;
    const MIN_SCALE = 0.50;
    const MAX_SCALE = 1.00;

    // Éléments à scaler avec leur coin d'ancrage (doit correspondre au transform-origin CSS)
    const scaledEls = [
        { sel: '#legend-container',    origin: 'bottom left'  },
        { sel: '.ol-zoom',             origin: 'top left'     },
        { sel: '.ol-control.recenter', origin: 'top right'    },
        { sel: '.ol-control.locate',   origin: 'top right'    },
        { sel: '.ol-scale-line',       origin: 'bottom left'  },
        { sel: '.ol-attribution',      origin: 'bottom right' },
        { sel: '.bm-control',          origin: 'bottom left'  },
    ];

    // Résoudre les éléments DOM (certains sont injectés par OL après DOMContentLoaded)
    function resolveEls() {
        return scaledEls.map(cfg => ({
            el:     document.querySelector(cfg.sel),
            origin: cfg.origin
        })).filter(item => item.el !== null);
    }

    function applyScale() {
        const mapWidth = mapEl.offsetWidth;
        if (!mapWidth) return;
        const raw   = mapWidth / REF_WIDTH;
        const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, raw));
        const val   = scale.toFixed(3);

        resolveEls().forEach(({ el, origin }) => {
            el.style.transformOrigin = origin;
            el.style.transform       = `scale(${val})`;
        });

        // Popup — via custom property pour préserver l'animation translateY
        const popupEl = document.getElementById('popup');
        if (popupEl) popupEl.style.setProperty('--popup-scale', val);
    }

    // Première application légèrement différée pour laisser OL injecter ses contrôles
    setTimeout(applyScale, 200);

    // Observer les redimensionnements du conteneur carte
    const ro = new ResizeObserver(() => applyScale());
    ro.observe(mapEl);
}

// === Initialisation des graphiques ECharts ===
function initCharts() {
    console.log('Initialisation des graphiques...');
    
    // Graphique température
    const chartContainer = document.getElementById('chartContainer');
    if (!chartContainer) {
        console.error('Container du graphique température non trouvé');
        return;
    }
    chart = echarts.init(chartContainer);
    
    // Graphique mortalité
    const mortalityContainer = document.getElementById('mortalityChartContainer');
    if (!mortalityContainer) {
        console.error('Container du graphique mortalité non trouvé');
        return;
    }
    mortalityChart = echarts.init(mortalityContainer);
    
    // Configuration de base en attendant les données
    const initTheme = getChartTheme();
    const loadingOption = {
        title: {
            text: 'Chargement...',
            left: 'center',
            textStyle: {
                fontSize: 14,
                color: initTheme.textColor
            }
        },
        grid: {
            left: '3%',
            right: '4%',
            bottom: '3%',
            top: '15%',
            containLabel: true
        }
    };
    
    chart.setOption(loadingOption);
    mortalityChart.setOption({
        ...loadingOption,
        title: { ...loadingOption.title, text: 'Chargement mortalité...' }
    });
}

// === Chargement des données depuis le fichier GeoJSON ===
async function loadData() {
    try {
        console.log('Chargement des données depuis:', DATA_URL4);
        
        const response = await fetch(DATA_URL4);
        
        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status} - ${response.statusText}`);
        }
        
        const geoData = await response.json();
        console.log('Données GeoJSON chargées:', geoData);
        
        // Extraction des features du GeoJSON
        if (geoData.features && Array.isArray(geoData.features)) {
            rawData = geoData.features.map(feature => feature.properties);
        } else if (Array.isArray(geoData)) {
            rawData = geoData;
        } else {
            throw new Error('Format de données non reconnu. Attendu: GeoJSON avec features ou Array');
        }
        
        console.log('Données extraites:', rawData.length, 'enregistrements');
        
        if (rawData.length > 0) {
            console.log('Exemple d\'enregistrement:', rawData[0]);
            console.log('Champs disponibles:', Object.keys(rawData[0]));
            
            // Analyser les valeurs uniques pour comprendre la structure
            const uniqueYears = [...new Set(rawData.map(r => r.time_year))].sort();
            const uniqueSSP = [...new Set(rawData.map(r => r.scenario_ssp))].filter(s => s);
            const uniqueAging = [...new Set(rawData.map(r => r.scenario_aging))].filter(s => s);
            
            console.log('Années uniques:', uniqueYears);
            console.log('Scénarios SSP uniques:', uniqueSSP);
            console.log('Scénarios aging uniques:', uniqueAging);
            
            // Vérifier s'il y a des données avec des dates
            const recordsWithDates = rawData.filter(r => r.time_date).length;
            console.log(`Enregistrements avec time_date: ${recordsWithDates}/${rawData.length}`);
            
            // Vérifier la présence du champ mortalité
            const recordsWithMortality = rawData.filter(r => r.predicted_death_rate !== undefined).length;
            console.log(`Enregistrements avec predicted_death_rate: ${recordsWithMortality}/${rawData.length}`);
            
            if (recordsWithDates > 0) {
                const exampleDate = rawData.find(r => r.time_date);
                console.log('Exemple de time_date:', exampleDate.time_date);
            }
            
            if (recordsWithMortality > 0) {
                const exampleMortality = rawData.find(r => r.predicted_death_rate !== undefined);
                console.log('Exemple de predicted_death_rate:', exampleMortality.predicted_death_rate);
            }
        }
        
        isDataLoaded = true;
        
        // Initialiser les textes des dropdowns
        updateDropdownText('years');
        updateDropdownText('ssp');
        updateDropdownText('aging');
        
        // Mettre à jour les graphiques
        updateAllCharts();
        
    } catch (error) {
        console.error('Erreur lors du chargement des données:', error);
        displayError(error);
    }
}

// === Configuration des écouteurs d'événements ===
function setupEventListeners() {
    console.log('Configuration des écouteurs d\'événements...');
    
    // Gestion des dropdowns
    setupDropdowns();
    
    // Bouton d'action (seulement Reset maintenant)
    const resetBtn = document.getElementById('resetFilters');
    if (resetBtn) {
        resetBtn.addEventListener('click', resetFilters);
    }
    
    // Bouton d'agrandissement du simulateur
    const expandBtn = document.getElementById('expandSimulator');
    if (expandBtn) {
        expandBtn.addEventListener('click', toggleSimulatorSize);
        console.log('Event listener ajouté au bouton d\'agrandissement');
    } else {
        console.warn('Bouton expandSimulator non trouvé');
    }
    
    // Écouter les changements de sélection
    document.querySelectorAll('.dropdown-options input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const dropdownType = this.closest('.dropdown-content').id.replace('Content', '');
            updateDropdownText(dropdownType);
            
            if (isDataLoaded) {
                updateAllCharts();
            }
        });
    });
    
    // Gestion de la responsivité
    window.addEventListener('resize', function() {
        if (chart) {
            chart.resize();
        }
        if (mortalityChart) {
            mortalityChart.resize();
        }
    });
    
    // Fermer les dropdowns en cliquant ailleurs
    document.addEventListener('click', function(event) {
        if (!event.target.closest('.dropdown-container')) {
            closeAllDropdowns();
        }
    });
    
    // Fermer le mode agrandi avec la touche Escape
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && isSimulatorExpanded) {
            toggleSimulatorSize();
        }
    });
}

// === Fonction d'agrandissement/réduction du simulateur ===
function toggleSimulatorSize() {
    console.log('toggleSimulatorSize appelée, état actuel:', isSimulatorExpanded);
    
    const rightRail = document.querySelector('.right-rail');
    const expandIcon = document.getElementById('expandIcon');
    const expandBtn = document.getElementById('expandSimulator');
    
    if (!rightRail) {
        console.error('Element .right-rail non trouvé');
        return;
    }
    if (!expandIcon) {
        console.error('Element #expandIcon non trouvé');
        return;
    }
    if (!expandBtn) {
        console.error('Element #expandSimulator non trouvé');
        return;
    }
    
    isSimulatorExpanded = !isSimulatorExpanded;
    console.log('Nouveau état:', isSimulatorExpanded);
    
    if (isSimulatorExpanded) {
        // Mode agrandi
        console.log('Passage en mode agrandi');
        rightRail.classList.add('simulator-expanded');
        expandIcon.className = 'fas fa-compress';
        expandBtn.title = 'Réduire la vue';
        
        // Créer l'overlay si il n'existe pas
        let overlay = document.querySelector('.simulator-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'simulator-overlay';
            document.body.appendChild(overlay);
            console.log('Overlay créé');
        }
        overlay.classList.add('show');
        
        // Empêcher le scroll du body
        document.body.style.overflow = 'hidden';
        document.body.classList.add('simulator-fullscreen');
        
    } else {
        // Mode normal
        console.log('Retour en mode normal');
        rightRail.classList.remove('simulator-expanded');
        expandIcon.className = 'fas fa-expand';
        expandBtn.title = 'Agrandir la vue';
        
        // Masquer l'overlay
        const overlay = document.querySelector('.simulator-overlay');
        if (overlay) {
            overlay.classList.remove('show');
        }
        
        // Rétablir le scroll du body
        document.body.style.overflow = '';
        document.body.classList.remove('simulator-fullscreen');
    }
    
    // Redimensionner les graphiques après un court délai pour que les transitions CSS se terminent
    setTimeout(() => {
        console.log('Redimensionnement des graphiques');
        if (chart) {
            chart.resize();
        }
        if (mortalityChart) {
            mortalityChart.resize();
        }
    }, 300);
    
    // Fermer les dropdowns ouverts lors du changement de taille
    closeAllDropdowns();
}

// === Configuration des dropdowns (simplifiée) ===
function setupDropdowns() {
    // Boutons pour ouvrir/fermer les dropdowns
    document.querySelectorAll('.dropdown-button').forEach(button => {
        button.addEventListener('click', function(e) {
            e.stopPropagation();
            const dropdownId = this.id.replace('Dropdown', 'Content');
            const content = document.getElementById(dropdownId);
            
            if (!content) return;
            
            // Fermer les autres dropdowns
            document.querySelectorAll('.dropdown-content').forEach(c => {
                if (c.id !== dropdownId) {
                    c.classList.remove('show');
                    c.previousElementSibling.classList.remove('active');
                }
            });
            
            // Basculer le dropdown actuel
            content.classList.toggle('show');
            this.classList.toggle('active');
        });
    });
}

// === Fermer tous les dropdowns ===
function closeAllDropdowns() {
    document.querySelectorAll('.dropdown-content').forEach(content => {
        content.classList.remove('show');
    });
    document.querySelectorAll('.dropdown-button').forEach(button => {
        button.classList.remove('active');
    });
}

// === Mettre à jour le texte affiché dans un dropdown ===
function updateDropdownText(dropdownType) {
    const container = document.getElementById(dropdownType + 'Content');
    const button = document.getElementById(dropdownType + 'Dropdown');
    
    if (!container || !button) return;
    
    const selectedText = button.querySelector('.selected-text');
    const checkedBoxes = container.querySelectorAll('input[type="checkbox"]:checked');
    const labels = Array.from(checkedBoxes).map(cb => cb.nextElementSibling.textContent);
    
    const t = TRANSLATIONS[currentLang] || TRANSLATIONS['fr'];
    if (labels.length === 0) {
        selectedText.textContent = t['dropdown-none'] || 'Aucune sélection';
    } else if (labels.length === 1) {
        selectedText.textContent = labels[0];
    } else if (labels.length <= 2) {
        selectedText.textContent = labels.join(', ');
    } else {
        const tpl = t['dropdown-many'] || '{n} éléments sélectionnés';
        selectedText.textContent = tpl.replace('{n}', labels.length);
    }
}

// === Obtenir les sélections actuelles ===
function getSelectedFilters() {
    const years = Array.from(document.querySelectorAll('#yearsContent input[type="checkbox"]:checked'))
        .map(cb => parseInt(cb.value));
    
    const sspScenarios = Array.from(document.querySelectorAll('#sspContent input[type="checkbox"]:checked'))
        .map(cb => cb.value);
    
    const agingScenarios = Array.from(document.querySelectorAll('#agingContent input[type="checkbox"]:checked'))
        .map(cb => cb.value);
    
    return { years, sspScenarios, agingScenarios };
}

// === Fonction utilitaire pour parser les dates DD/MM/YYYY ===
function parseDate(dateString) {
    try {
        if (!dateString) return null;
        
        // Nettoyer la chaîne de date
        dateString = dateString.toString().trim();
        
        // Essayer plusieurs formats
        let parts;
        
        // Format DD/MM/YYYY
        if (dateString.includes('/')) {
            parts = dateString.split('/');
        }
        // Format DD-MM-YYYY
        else if (dateString.includes('-') && dateString.length <= 10) {
            parts = dateString.split('-');
            // Si c'est YYYY-MM-DD, inverser l'ordre
            if (parts[0].length === 4) {
                parts = [parts[2], parts[1], parts[0]];
            }
        }
        // Format DDMMYYYY
        else if (dateString.length === 8 && !isNaN(dateString)) {
            parts = [dateString.slice(0, 2), dateString.slice(2, 4), dateString.slice(4, 8)];
        }
        else {
            console.warn('Format de date non reconnu:', dateString);
            return null;
        }
        
        if (parts.length !== 3) {
            console.warn('Impossible de parser la date:', dateString);
            return null;
        }
        
        const day = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1; // Les mois en JS commencent à 0
        const year = parseInt(parts[2]);
        
        if (isNaN(day) || isNaN(month) || isNaN(year)) {
            console.warn('Valeurs numériques invalides dans la date:', dateString, { day, month: month + 1, year });
            return null;
        }
        
        // Vérifications de validité
        if (year < 1900 || year > 2100) {
            console.warn('Année hors limites:', year);
            return null;
        }
        
        if (month < 0 || month > 11) {
            console.warn('Mois invalide:', month + 1);
            return null;
        }
        
        if (day < 1 || day > 31) {
            console.warn('Jour invalide:', day);
            return null;
        }
        
        const date = new Date(year, month, day);
        
        // Vérifier que la date créée correspond aux valeurs entrées
        if (date.getDate() !== day || date.getMonth() !== month || date.getFullYear() !== year) {
            console.warn('Date invalide créée:', dateString, 'résultat:', date);
            return null;
        }
        
        return date;
        
    } catch (error) {
        console.warn('Erreur lors du parsing de la date:', dateString, error);
        return null;
    }
}

// === Fonction pour obtenir le jour de l'année (1-365) ===
function getDayOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date - start;
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
}

// === Mise à jour de tous les graphiques ===
function updateAllCharts() {
    updateChart();
    updateMortalityChart();
}

// === Mise à jour du graphique température ===
function updateChart() {
    if (!isDataLoaded || rawData.length === 0) {
        console.warn('Données non chargées, impossible de mettre à jour le graphique température');
        displayEmptyChart('Données en cours de chargement...', chart);
        return;
    }
    
    const filters = getSelectedFilters();
    console.log('Filtres sélectionnés pour température:', filters);
    
    // Validation des sélections
    if (filters.years.length === 0) {
        displayEmptyChart('Sélectionnez au moins une année', chart);
        return;
    }
    
    if (filters.sspScenarios.length === 0) {
        displayEmptyChart('Sélectionnez au moins un scénario SSP', chart);
        return;
    }
    
    if (filters.agingScenarios.length === 0) {
        displayEmptyChart('Sélectionnez au moins un scénario de vieillissement', chart);
        return;
    }
    
    // Traitement des données par combinaisons de scénarios
    const seriesData = processDataByField(filters, 'daymet_tmax_moving_avg_3');
    console.log('Séries de données température générées:', seriesData.length);
    
    if (seriesData.length === 0) {
        displayEmptyChart('Aucune donnée de température correspondant aux critères sélectionnés', chart);
        return;
    }
    
    // Création du graphique
    const option = createTemperatureChartOption(seriesData, filters.years);
    chart.setOption(option, true);
    
    console.log('Graphique température mis à jour avec', seriesData.length, 'séries pour les années:', filters.years);
}

// === Mise à jour du graphique mortalité ===
function updateMortalityChart() {
    if (!isDataLoaded || rawData.length === 0) {
        console.warn('Données non chargées, impossible de mettre à jour le graphique mortalité');
        displayEmptyChart('Données en cours de chargement...', mortalityChart);
        return;
    }
    
    const filters = getSelectedFilters();
    console.log('Filtres sélectionnés pour mortalité:', filters);
    
    // Validation des sélections
    if (filters.years.length === 0) {
        displayEmptyChart('Sélectionnez au moins une année', mortalityChart);
        return;
    }
    
    if (filters.sspScenarios.length === 0) {
        displayEmptyChart('Sélectionnez au moins un scénario SSP', mortalityChart);
        return;
    }
    
    if (filters.agingScenarios.length === 0) {
        displayEmptyChart('Sélectionnez au moins un scénario de vieillissement', mortalityChart);
        return;
    }
    
    // Traitement des données par combinaisons de scénarios
    const seriesData = processDataByField(filters, 'predicted_death_rate');
    console.log('Séries de données mortalité générées:', seriesData.length);
    
    if (seriesData.length === 0) {
        displayEmptyChart('Aucune donnée de mortalité correspondant aux critères sélectionnés', mortalityChart);
        return;
    }
    
    // Création du graphique
    const option = createMortalityChartOption(seriesData, filters.years);
    mortalityChart.setOption(option, true);
    
    console.log('Graphique mortalité mis à jour avec', seriesData.length, 'séries pour les années:', filters.years);
}

// === Traitement des données par champ (générique) ===
function processDataByField(filters, fieldName) {
    const allSeriesData = [];
    let seriesIndex = 0;
    
    // Pour chaque année sélectionnée
    filters.years.forEach(year => {
        
        // Définir les scénarios applicables selon l'année
        let applicableSSP, applicableAging;
        
        if (year === 2018) {
            // Pour 2018, seulement historical si sélectionné
            applicableSSP = filters.sspScenarios.includes('historical') ? ['historical'] : [];
            applicableAging = filters.agingScenarios.includes('historical') ? ['historical'] : [];
        } else {
            // Pour les autres années, exclure historical
            applicableSSP = filters.sspScenarios.filter(ssp => ssp !== 'historical');
            applicableAging = filters.agingScenarios.filter(aging => aging !== 'historical');
        }
        
        // Pour chaque combinaison SSP × Aging
        applicableSSP.forEach(sspScenario => {
            applicableAging.forEach(agingScenario => {
                
                const combinationData = [];
                
                // Filtrer les données pour cette combinaison exacte
                rawData.forEach(record => {
                    const recordYear = parseInt(record.time_year);
                    const fieldValue = parseFloat(record[fieldName]);
                    const dateString = record.time_date;
                    
                    // Vérifications de base
                    if (recordYear !== year || isNaN(fieldValue) || !dateString) return;
                    
                    // Parser la date
                    const date = parseDate(dateString);
                    if (!date) return;
                    
                    // Récupérer les scénarios de l'enregistrement
                    const recordSSP = record.scenario_ssp;
                    const recordAging = record.scenario_aging;
                    
                    // Vérifier la correspondance exacte des scénarios
                    let matchesSSP = false;
                    let matchesAging = false;
                    
                    if (year === 2018) {
                        // Pour 2018: vérifier historical
                        matchesSSP = (sspScenario === 'historical' && recordSSP === 'historical');
                        matchesAging = (agingScenario === 'historical' && recordAging === 'historical');
                    } else {
                        // Pour autres années: correspondance directe
                        matchesSSP = (recordSSP === sspScenario);
                        matchesAging = (recordAging === agingScenario);
                    }
                    
                    if (matchesSSP && matchesAging) {
                        const dayOfYear = getDayOfYear(date);
                        combinationData.push({
                            dayOfYear,
                            value: fieldValue,
                            date,
                            dateString,
                            sspScenario: recordSSP,
                            agingScenario: recordAging
                        });
                    }
                });
                
                // Si des données existent pour cette combinaison
                if (combinationData.length > 0) {
                    // Trier par jour de l'année
                    combinationData.sort((a, b) => a.dayOfYear - b.dayOfYear);
                    
                    // Calculer la valeur moyenne
                    const avgValue = combinationData.reduce((sum, point) => sum + point.value, 0) / combinationData.length;
                    
                    // Préparer les données pour le graphique
                    const chartData = combinationData.map(point => ({
                        value: [point.dayOfYear, point.value],
                        date: point.date,
                        dateString: point.dateString
                    }));
                    
                    // Créer le nom de la série
                    let seriesName;
                    if (year === 2018) {
                        seriesName = `${year} (historical)`;
                    } else {
                        const sspName = sspScenario.toUpperCase();
                        const agingName = agingScenario.replace('scenario_aging_', '');
                        seriesName = `${year} (${sspName}-${agingName})`;
                    }
                    
                    // Ajouter la série
                    allSeriesData.push({
                        name: seriesName,
                        year: year,
                        sspScenario: sspScenario,
                        agingScenario: agingScenario,
                        data: chartData,
                        avgValue: avgValue,
                        color: yearColors[seriesIndex % yearColors.length]
                    });
                    
                    console.log(`✓ Série créée (${fieldName}): ${seriesName} (${combinationData.length} points)`);
                    seriesIndex++;
                }
            });
        });
    });
    
    console.log(`Total des séries générées pour ${fieldName}: ${allSeriesData.length}`);
    return allSeriesData;
}

// === Création de la configuration ECharts pour les variations de température ===
function createTemperatureChartOption(seriesData, selectedYears) {
  const theme = getChartTheme();
    // Calculer les statistiques générales
    let allValues = [];
    seriesData.forEach(series => {
        series.data.forEach(point => {
            allValues.push(point.value[1]);
        });
    });
    
    let minVal, maxVal, range, yMin, yMax;
    
    if (allValues.length > 0) {
        minVal = Math.min(...allValues);
        maxVal = Math.max(...allValues);
        range = maxVal - minVal;
        
        // Padding adapté pour maximiser la visibilité des variations
        let padding = range < 3 ? range * 0.15 : range * 0.08;
        
        yMin = Math.max(0, minVal - padding);
        yMax = maxVal + padding;
        
        yMin = Math.floor(yMin * 10) / 10;
        yMax = Math.ceil(yMax * 10) / 10;
    } else {
        yMin = 20;
        yMax = 40;
    }
    
    // Créer les séries pour ECharts
    const series = seriesData.map(seriesInfo => ({
        name: seriesInfo.name,
        type: 'line',
        data: seriesInfo.data,
        lineStyle: {
            width: 2,
            color: seriesInfo.color
        },
        itemStyle: {
            color: seriesInfo.color,
            borderWidth: 1,
            borderColor: '#fff'
        },
        symbol: 'circle',
        symbolSize: 4,
        smooth: true,
        connectNulls: false,
        emphasis: {
            itemStyle: {
                symbolSize: 6,
                borderWidth: 2
            },
            lineStyle: {
                width: 3
            }
        }
    }));
    
    const subtitle = selectedYears.length === 1 ?
        `${selectedYears[0]} • ${minVal?.toFixed(1)}°C - ${maxVal?.toFixed(1)}°C` :
        `${selectedYears.length} années • ${minVal?.toFixed(1)}°C - ${maxVal?.toFixed(1)}°C`;

    return {
        title: {
            text: (TRANSLATIONS[currentLang] || TRANSLATIONS['fr'])['temp-chart-main-title'],
            subtext: subtitle,
            left: 'center',
            textStyle: {
                fontSize: 14,
                fontWeight: 'bold',
                color: theme.titleColor
            },
            subtextStyle: {
                fontSize: 10,
                color: theme.textColor
            }
        },
        tooltip: {
            trigger: 'axis',
            formatter: function(params) {
                if (!params || params.length === 0) return '';

                const firstParam = params[0];
                const dataItem = firstParam.data;
                const dateString = dataItem.dateString || 'Date inconnue';

                let tooltip = `<strong>${dateString}</strong><br/>`;

                // Trier par température
                const sortedParams = params.sort((a, b) => b.value[1] - a.value[1]);

                sortedParams.forEach((param, index) => {
                    const temp = param.value[1];
                    if (!isNaN(temp)) {
                        const rank = sortedParams.length > 1 ? (index === 0 ? ' 🔥' : index === sortedParams.length - 1 ? ' ❄️' : '') : '';
                        tooltip += `<span style="color: ${param.color};">●</span> ${param.seriesName}: <strong>${temp.toFixed(1)}°C</strong>${rank}<br/>`;
                    }
                });

                return tooltip;
            },
            backgroundColor: theme.tooltipBg,
            borderColor: theme.tooltipBorder,
            borderWidth: 1,
            textStyle: {
                color: theme.tooltipText,
                fontSize: 11
            }
        },
        legend: {
            type: 'scroll',
            orient: 'horizontal',
            left: 'center',
            top: '12%',
            textStyle: {
                fontSize: 9,
                color: theme.textColor
            }
        },
        grid: {
            left: '8%',
            right: '5%',
            bottom: '8%',
            top: '25%',
            containLabel: true
        },
        xAxis: [
            {
                // Axe 0 : lignes de grille aux frontières des mois, sans labels
                type: 'value',
                name: (TRANSLATIONS[currentLang] || TRANSLATIONS['fr'])['temp-xaxis'],
                nameLocation: 'middle',
                nameGap: 20,
                min: 120,
                max: 280,
                nameTextStyle: { fontSize: 10, color: theme.titleColor },
                axisLabel: { show: false },
                axisTick: { show: false },
                axisLine: { lineStyle: { color: theme.axisLineColor } },
                splitLine: {
                    show: true,
                    lineStyle: { color: theme.splitLineColor, type: 'solid', width: 1 }
                }
            },
            {
                // Axe 1 : labels au milieu de chaque rectangle mensuel, sans lignes de grille
                type: 'value',
                position: 'bottom',
                min: 120,
                max: 280,
                interval: 15,
                offset: 0,
                axisLabel: {
                    formatter: function(value) {
                        if (value === 135) return 'Mai';
                        if (value === 165) return 'Juin';
                        if (value === 195) return 'Juil';
                        if (value === 225) return 'Août';
                        if (value === 255) return 'Sept';
                        return '';
                    },
                    fontSize: 9,
                    color: theme.textColor
                },
                axisLine: { show: false },
                axisTick: { show: false },
                splitLine: { show: false }
            }
        ],
        yAxis: {
            type: 'value',
            name: (TRANSLATIONS[currentLang] || TRANSLATIONS['fr'])['temp-yaxis'],
            nameLocation: 'middle',
            nameGap: 35,
            min: yMin,
            max: yMax,
            nameTextStyle: {
                fontSize: 10,
                color: theme.titleColor
            },
            axisLabel: {
                formatter: function(value) {
                    return value.toFixed(1) + '°';
                },
                fontSize: 9,
                color: theme.textColor
            },
            axisLine: {
                lineStyle: { color: theme.axisLineColor }
            },
            splitLine: {
                show: true,
                lineStyle: {
                    color: theme.splitLineColor,
                    type: 'solid'
                }
            }
        },
        animation: true,
        animationDuration: 800,
        animationEasing: 'cubicOut',
        series: series
    };
}

// === Création de la configuration ECharts pour les variations de mortalité ===
function createMortalityChartOption(seriesData, selectedYears) {
  const theme = getChartTheme();
    // Calculer les statistiques générales
    let allValues = [];
    seriesData.forEach(series => {
        series.data.forEach(point => {
            allValues.push(point.value[1]);
        });
    });
    
    let minVal, maxVal, range, yMin, yMax;
    
    if (allValues.length > 0) {
        minVal = Math.min(...allValues);
        maxVal = Math.max(...allValues);
        range = maxVal - minVal;
        
        // Padding adapté pour maximiser la visibilité des variations
        let padding = range < 0.01 ? range * 0.15 : range * 0.08;
        
        yMin = Math.max(0, minVal - padding);
        yMax = maxVal + padding;
        
        // Arrondir selon la grandeur des valeurs
        if (range < 0.1) {
            yMin = Math.floor(yMin * 1000) / 1000;
            yMax = Math.ceil(yMax * 1000) / 1000;
        } else if (range < 1) {
            yMin = Math.floor(yMin * 100) / 100;
            yMax = Math.ceil(yMax * 100) / 100;
        } else {
            yMin = Math.floor(yMin * 10) / 10;
            yMax = Math.ceil(yMax * 10) / 10;
        }
    } else {
        yMin = 0;
        yMax = 1;
    }
    
    // Créer les séries pour ECharts
    const series = seriesData.map(seriesInfo => ({
        name: seriesInfo.name,
        type: 'line',
        data: seriesInfo.data,
        lineStyle: {
            width: 2,
            color: seriesInfo.color
        },
        itemStyle: {
            color: seriesInfo.color,
            borderWidth: 1,
            borderColor: '#fff'
        },
        symbol: 'circle',
        symbolSize: 4,
        smooth: true,
        connectNulls: false,
        emphasis: {
            itemStyle: {
                symbolSize: 6,
                borderWidth: 2
            },
            lineStyle: {
                width: 3
            }
        }
    }));
    
    const subtitle = selectedYears.length === 1 ?
        `${selectedYears[0]} • ${minVal?.toFixed(3)} - ${maxVal?.toFixed(3)}` :
        `${selectedYears.length} années • ${minVal?.toFixed(3)} - ${maxVal?.toFixed(3)}`;

    return {
        title: {
            text: (TRANSLATIONS[currentLang] || TRANSLATIONS['fr'])['mortality-chart-main-title'],
            subtext: subtitle,
            left: 'center',
            textStyle: {
                fontSize: 14,
                fontWeight: 'bold',
                color: '#dc3545'
            },
            subtextStyle: {
                fontSize: 10,
                color: theme.textColor
            }
        },
        tooltip: {
            trigger: 'axis',
            formatter: function(params) {
                if (!params || params.length === 0) return '';

                const firstParam = params[0];
                const dataItem = firstParam.data;
                const dateString = dataItem.dateString || 'Date inconnue';

                let tooltip = `<strong>${dateString}</strong><br/>`;

                // Trier par taux de mortalité (décroissant)
                const sortedParams = params.sort((a, b) => b.value[1] - a.value[1]);

                sortedParams.forEach((param, index) => {
                    const rate = param.value[1];
                    if (!isNaN(rate)) {
                        const rank = sortedParams.length > 1 ? (index === 0 ? ' ⚠️' : index === sortedParams.length - 1 ? ' ✓' : '') : '';
                        tooltip += `<span style="color: ${param.color};">●</span> ${param.seriesName}: <strong>${rate.toFixed(4)}</strong>${rank}<br/>`;
                    }
                });

                return tooltip;
            },
            backgroundColor: theme.tooltipBg,
            borderColor: theme.tooltipBorder,
            borderWidth: 1,
            textStyle: {
                color: theme.tooltipText,
                fontSize: 11
            }
        },
        legend: {
            type: 'scroll',
            orient: 'horizontal',
            left: 'center',
            top: '12%',
            textStyle: {
                fontSize: 9,
                color: theme.textColor
            }
        },
        grid: {
            left: '8%',
            right: '5%',
            bottom: '8%',
            top: '25%',
            containLabel: true
        },
        xAxis: [
            {
                // Axe 0 : lignes de grille aux frontières des mois, sans labels
                type: 'value',
                name: (TRANSLATIONS[currentLang] || TRANSLATIONS['fr'])['temp-xaxis'],
                nameLocation: 'middle',
                nameGap: 20,
                min: 120,
                max: 280,
                nameTextStyle: { fontSize: 10, color: theme.titleColor },
                axisLabel: { show: false },
                axisTick: { show: false },
                axisLine: { lineStyle: { color: theme.axisLineColor } },
                splitLine: {
                    show: true,
                    lineStyle: { color: theme.splitLineColor, type: 'solid', width: 1 }
                }
            },
            {
                // Axe 1 : labels au milieu de chaque rectangle mensuel, sans lignes de grille
                type: 'value',
                position: 'bottom',
                min: 120,
                max: 280,
                interval: 15,
                offset: 0,
                axisLabel: {
                    formatter: function(value) {
                        if (value === 135) return 'Mai';
                        if (value === 165) return 'Juin';
                        if (value === 195) return 'Juil';
                        if (value === 225) return 'Août';
                        if (value === 255) return 'Sept';
                        return '';
                    },
                    fontSize: 9,
                    color: theme.textColor
                },
                axisLine: { show: false },
                axisTick: { show: false },
                splitLine: { show: false }
            }
        ],
        yAxis: {
            type: 'value',
            name: (TRANSLATIONS[currentLang] || TRANSLATIONS['fr'])['mortality-yaxis'],
            nameLocation: 'middle',
            nameGap: 35,
            min: yMin,
            max: yMax,
            nameTextStyle: {
                fontSize: 10,
                color: '#dc3545'
            },
            axisLabel: {
                formatter: function(value) {
                    if (range < 0.01) {
                        return value.toFixed(4);
                    } else if (range < 0.1) {
                        return value.toFixed(3);
                    } else {
                        return value.toFixed(2);
                    }
                },
                fontSize: 9,
                color: theme.textColor
            },
            axisLine: {
                lineStyle: { color: theme.axisLineColor }
            },
            splitLine: {
                show: true,
                lineStyle: {
                    color: theme.splitLineColor,
                    type: 'solid'
                }
            }
        },
        animation: true,
        animationDuration: 800,
        animationEasing: 'cubicOut',
        series: series
    };
}

// === Affichage d'un graphique vide ===
function displayEmptyChart(message = 'Aucune donnée à afficher', chartInstance) {
    const theme = getChartTheme();
    const option = {
        title: {
            text: message,
            subtext: 'Ajustez vos filtres',
            left: 'center',
            top: 'middle',
            textStyle: {
                fontSize: 14,
                color: theme.textColor
            },
            subtextStyle: {
                fontSize: 11,
                color: theme.textColor
            }
        },
        grid: {
            left: '5%',
            right: '5%',
            bottom: '10%',
            top: '30%',
            containLabel: true
        },
        xAxis: {
            type: 'value',
            show: false
        },
        yAxis: {
            type: 'value',
            show: false
        },
        series: []
    };
    
    chartInstance.setOption(option, true);
}

// === Affichage des erreurs ===
function displayError(error) {
    const errorHtml = `
        <div class="error">
            <h6>⚠ Erreur de chargement</h6>
            <p><strong>Message:</strong> ${error.message}</p>
            <p><strong>Fichier:</strong> ${DATA_URL4}</p>
            <small>Vérifiez que le fichier existe et est accessible.</small>
        </div>
    `;
    
    const chartContainer = document.getElementById('chartContainer');
    const mortalityContainer = document.getElementById('mortalityChartContainer');
    
    if (chartContainer) {
        chartContainer.innerHTML = errorHtml;
    }
    if (mortalityContainer) {
        mortalityContainer.innerHTML = errorHtml;
    }
}

// === Fonction de réinitialisation simplifiée ===
function resetFilters() {
    // Décocher toutes les cases
    document.querySelectorAll('.dropdown-options input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
    });
    
    // Cocher seulement les valeurs par défaut
    const defaultChecks = [
        'year_2018',
        'ssp_historical', 
        'ssp_ssp126',
        'aging_historical',
        'aging_younger'
    ];
    
    defaultChecks.forEach(id => {
        const checkbox = document.getElementById(id);
        if (checkbox) {
            checkbox.checked = true;
        }
    });
    
    // Mettre à jour les textes
    updateDropdownText('years');
    updateDropdownText('ssp');
    updateDropdownText('aging');
    
    if (isDataLoaded) {
        updateAllCharts();
    }
}