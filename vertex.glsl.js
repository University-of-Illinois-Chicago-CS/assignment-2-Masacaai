export default `#version 300 es

in vec3 position;
out vec4 vColor;
uniform mat4 modelview;
uniform mat4 projection;
uniform float heightScale;

void main() {
  vec3 positionTransformed = 0.5 * position.xyz + vec3(0.5, 0.5, 0.5);
  vec3 scaledPositions = position.xyz;
  scaledPositions.y *= heightScale * 0.01;
  vColor = vec4(positionTransformed.xyz, 1);
  gl_Position = projection * modelview * vec4(scaledPositions, 1);
}
`;