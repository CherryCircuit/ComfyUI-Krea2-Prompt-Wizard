/* Shared physical lighting geometry, independent of orbit-camera state. */
(function () {
  "use strict";
  const K = window.KREA2;
  const AIM_HEIGHT = 1.12;
  const finite = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;
  function physicalCoordinates(light) {
    const elevation = finite(light.heightDeg, 25) * Math.PI / 180;
    const radial = finite(light.distanceM, 1.5);
    return {
      groundDistanceM: Math.max(0, finite(light.groundDistanceM, radial * Math.cos(elevation))),
      heightM: Math.max(0, finite(light.heightM, AIM_HEIGHT + radial * Math.sin(elevation))),
    };
  }
  function lightPosition(light) {
    const coordinates = physicalCoordinates(light);
    const azimuth = finite(light.angleDeg, 0) * Math.PI / 180;
    return { x: coordinates.groundDistanceM * Math.sin(azimuth),
      y: coordinates.heightM, z: coordinates.groundDistanceM * Math.cos(azimuth) };
  }
  function displayDistance(metres, units) { return units === "ft" ? metres / 0.3048 : metres; }
  function metresFromDisplay(value, units) { return units === "ft" ? Number(value) * 0.3048 : Number(value); }
  function physicalPhrase(light) {
    const coordinates = physicalCoordinates(light);
    const angle = ((finite(light.angleDeg, 0) % 360) + 360) % 360;
    const sides = ["front", "front left", "left", "back left", "back", "back right", "right", "front right"];
    const side = sides[Math.round(angle / 45) % 8];
    const elevation = Math.atan2(coordinates.heightM - AIM_HEIGHT, coordinates.groundDistanceM) * 180 / Math.PI;
    const height = elevation > 45 ? "from above" : elevation > 15 ? "slightly above" : elevation < -15 ? "from below" : "at subject level";
    const match = String(light.label || "").toLowerCase().match(/\b(key|fill|rim)\b/);
    const role = match ? match[1] + " light" : "light";
    const distance = coordinates.groundDistanceM <= 1 ? ", close to the subject"
      : coordinates.groundDistanceM >= 3 ? ", distant from the subject" : "";
    const color = String(light.color || "").trim();
    return role + " coming from the subject’s " + side + ", " + height + distance
      + (color && color !== "white" ? ", in " + color : "");
  }
  const subtract = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  function normalized(v) {
    const length = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / length, y: v.y / length, z: v.z / length };
  }
  function ellipsoid(center, radii, color, triangles, segments = 14, rings = 9) {
    const point = (ring, segment) => {
      const latitude = ring / rings * Math.PI;
      const longitude = segment / segments * Math.PI * 2;
      return { x: center.x + radii.x * Math.sin(latitude) * Math.sin(longitude),
        y: center.y + radii.y * Math.cos(latitude),
        z: center.z + radii.z * Math.sin(latitude) * Math.cos(longitude) };
    };
    for (let ring = 0; ring < rings; ring++) {
      for (let segment = 0; segment < segments; segment++) {
        const a = point(ring, segment), b = point(ring + 1, segment);
        const c = point(ring + 1, segment + 1), d = point(ring, segment + 1);
        for (const vertices of [[a, b, c], [a, c, d]]) {
          const centroid = { x: (vertices[0].x + vertices[1].x + vertices[2].x) / 3,
            y: (vertices[0].y + vertices[1].y + vertices[2].y) / 3,
            z: (vertices[0].z + vertices[1].z + vertices[2].z) / 3 };
          const normal = normalized({ x: (centroid.x - center.x) / (radii.x * radii.x),
            y: (centroid.y - center.y) / (radii.y * radii.y),
            z: (centroid.z - center.z) / (radii.z * radii.z) });
          triangles.push({ vertices, centroid, normal, color });
        }
      }
    }
  }
  function createBustMesh() {
    const mesh = [], clay = [164, 164, 157], dark = [65, 70, 74];
    const part = (x, y, z, rx, ry, rz, color = clay, segments, rings) =>
      ellipsoid({ x, y, z }, { x: rx, y: ry, z: rz }, color, mesh, segments, rings);
    part(0, .74, 0, .37, .31, .22);
    part(0, 1.03, 0, .52, .20, .24);
    part(0, 1.25, 0, .09, .19, .10);
    part(0, 1.57, 0, .19, .27, .19, clay, 18, 12);
    part(-.195, 1.57, 0, .042, .073, .042, clay, 8, 6);
    part(.195, 1.57, 0, .042, .073, .042, clay, 8, 6);
    part(0, 1.56, .19, .045, .082, .085, clay, 8, 6);
    part(-.075, 1.64, .175, .033, .013, .02, dark, 8, 4);
    part(.075, 1.64, .175, .033, .013, .02, dark, 8, 4);
    part(0, 1.45, .18, .063, .013, .023, dark, 8, 4);
    return mesh;
  }
  const BUST = createBustMesh();
  function shadedBust(project, lights, colorHex) {
    return BUST.map(triangle => {
      const color = triangle.color.map(channel => channel * .18);
      lights.forEach(light => {
        const strength = finite(light.strength, 1.5);
        if (light.enabled === false || strength <= 0) return;
        const vector = subtract(lightPosition(light), triangle.centroid);
        const diffuse = Math.max(0, dot(triangle.normal, normalized(vector)))
          * strength / (1 + dot(vector, vector) * .16);
        const hex = colorHex(light.color).replace("#", "");
        for (let channel = 0; channel < 3; channel++) {
          const tint = parseInt(hex.slice(channel * 2, channel * 2 + 2), 16) / 255;
          color[channel] += triangle.color[channel] * diffuse * tint;
        }
      });
      const points = triangle.vertices.map(project);
      return { points, depth: points.reduce((sum, p) => sum + p.z, 0) / 3,
        fill: "rgb(" + color.map(channel => Math.round(Math.min(255, channel))).join(",") + ")" };
    }).sort((a, b) => b.depth - a.depth);
  }
  K.lightingScene = { AIM_HEIGHT, physicalCoordinates, lightPosition, displayDistance,
    metresFromDisplay, physicalPhrase, createBustMesh, shadedBust };
})();
