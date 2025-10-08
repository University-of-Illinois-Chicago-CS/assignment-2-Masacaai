import vertexShaderSrc from './vertex.glsl.js';
import fragmentShaderSrc from './fragment.glsl.js'

var gl = null;
var vao = null;
var program = null;
var vertexCount = 0;
var uniformModelViewLoc = null;
var uniformProjectionLoc = null;
var uniformHeightScaleLoc = null;
var heightmapData = null;
var modelY = 0;
var modelZ = 0;
var eyeX = 0;
var eyeY = 0;
var eyeZ = 0;
var wireframe = false;

function processImage(img)
{
	// draw the image into an off-screen canvas
	var off = document.createElement('canvas');
	
	var sw = img.width, sh = img.height;
	off.width = sw; off.height = sh;
	
	var ctx = off.getContext('2d');
	ctx.drawImage(img, 0, 0, sw, sh);
	
	// read back the image pixel data
	var imgd = ctx.getImageData(0,0,sw,sh);
	var px = imgd.data;
	
	// create a an array will hold the height value
	var heightArray = new Float32Array(sw * sh);
	
	// loop through the image, rows then columns
	for (var y=0;y<sh;y++) 
	{
		for (var x=0;x<sw;x++) 
		{
			// offset in the image buffer
			var i = (y*sw + x)*4;
			
			// read the RGB pixel value
			var r = px[i+0], g = px[i+1], b = px[i+2];
			
			// convert to greyscale value between 0 and 1
			var lum = (0.2126*r + 0.7152*g + 0.0722*b) / 255.0;

			// store in array
			heightArray[y*sw + x] = lum;
		}
	}

	return {
		data: heightArray,
		width: sw,
		height: sw
	};
}


window.loadImageFile = function(event)
{

	var f = event.target.files && event.target.files[0];
	if (!f) return;
	
	// create a FileReader to read the image file
	var reader = new FileReader();
	reader.onload = function() 
	{
		// create an internal Image object to hold the image into memory
		var img = new Image();
		img.onload = function() 
		{
			// heightmapData is globally defined
			heightmapData = processImage(img);

			var positions = [];

			for (var y = 0; y < heightmapData.height - 1; y++) {
				for (var x = 0; x < heightmapData.width - 1; x++) {
					var h1 = heightmapData.data[y * heightmapData.width + x];
					var h2 = heightmapData.data[y * heightmapData.width + (x + 1)];
					var h3 = heightmapData.data[(y + 1) * heightmapData.width + x];
					var h4 = heightmapData.data[(y + 1) * heightmapData.width + (x + 1)];

					var x1 = (x / (heightmapData.width - 1)) * 2 - 1;
					var y1 = (y / (heightmapData.height - 1)) * 2 - 1;
					var x2 = ((x + 1) / (heightmapData.width - 1)) * 2 - 1;
					var y2 = ((y + 1) / (heightmapData.height - 1)) * 2 - 1;

					// First triangle (top-left)
					positions.push(x1, h1, y1);
					positions.push(x2, h2, y1);
					positions.push(x1, h3, y2);

					// Second triangle (bottom-right)
					positions.push(x2, h2, y1);
					positions.push(x2, h4, y2);
					positions.push(x1, h3, y2);
				}
			}

			vertexCount = positions.length / 3; // each vertex has 3 components (x, y, z)

			var positionBuffer = createBuffer(gl, gl.ARRAY_BUFFER, new Float32Array(positions));
			
			// re-create the VAO with the new position buffer
			var posAttribLoc = gl.getAttribLocation(program, "position");
			vao = createVAO(gl,
				// positions
				posAttribLoc, positionBuffer,

				// normals (unused in this assignments)
				null, null,

				// colors (not needed--computed by shader)
				null, null
			);		
			console.log('loaded image: ' + heightmapData.width + ' x ' + heightmapData.height);

		};
		img.onerror = function() 
		{
			console.error("Invalid image file.");
			alert("The selected file could not be loaded as an image.");
		};

		// the source of the image is the data load from the file
		img.src = reader.result;
	};
	reader.readAsDataURL(f);
}

window.toggleWireframe = function() {
	wireframe = document.querySelector("#wireframe").checked;
}

function setupViewMatrix(eye, target)
{
    var forward = normalize(subtract(target, eye));
    var upHint  = [0, 1, 0];

    var right = normalize(cross(forward, upHint));
    var up    = cross(right, forward);

    var view = lookAt(eye, target, up);
    return view;

}
function draw()
{

	var fovRadians = 70 * Math.PI / 180;
	var aspectRatio = +gl.canvas.width / +gl.canvas.height;
	var nearClip = 0.001;
	var farClip = 20.0;

	// perspective projection
	var projectionMatrix;
	if (document.querySelector("#projection").value == 'perspective')
	{
		projectionMatrix= perspectiveMatrix(
			fovRadians,
			aspectRatio,
			nearClip,
			farClip,
		);
	}
	else { // orthographic projection
		projectionMatrix = orthographicMatrix(
			-1.5 * aspectRatio, 
			1.5 * aspectRatio, 
			-1.5, 
			1.5, 
			nearClip, 
			farClip
		);
	}

	// rotation angles
	var rotY = ((modelY / gl.canvas.width) * 360) * Math.PI / 180;
	var rotZ = ((modelZ / gl.canvas.height) * 360) * Math.PI / 180;

	// eye and target
	var eye = [eyeX, eyeY, eyeZ];
	var target = add(eye, [0, 0, -1]);

	var modelMatrix = multiplyMatrices(rotateYMatrix(rotY), rotateZMatrix(rotZ));
	// TODO: set up transformations to the model

	// setup viewing matrix
	var eyeToTarget = subtract(target, eye);
	var viewMatrix = setupViewMatrix(eye, target);

	// model-view Matrix = view * model
	var modelviewMatrix = multiplyMatrices(viewMatrix, modelMatrix);

	var heightScale = parseFloat(document.querySelector("#height").value);

	// enable depth testing
	gl.enable(gl.DEPTH_TEST);

	// disable face culling to render both sides of the triangles
	gl.disable(gl.CULL_FACE);

	gl.clearColor(0.2, 0.2, 0.2, 1);
	gl.clear(gl.COLOR_BUFFER_BIT);

	gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
	gl.useProgram(program);
	
	// update modelview and projection matrices to GPU as uniforms
	gl.uniformMatrix4fv(uniformModelViewLoc, false, new Float32Array(modelviewMatrix));
	gl.uniformMatrix4fv(uniformProjectionLoc, false, new Float32Array(projectionMatrix));
	gl.uniform1f(uniformHeightScaleLoc, heightScale);


	gl.bindVertexArray(vao);
	
	var primitiveType = wireframe ? gl.LINES : gl.TRIANGLES;
	gl.drawArrays(primitiveType, 0, vertexCount);

	requestAnimationFrame(draw);

}

var isDragging = false;
var startX, startY;
var leftMouse = false;

function addMouseCallback(canvas)
{
	isDragging = false;

	canvas.addEventListener("mousedown", function (e) 
	{
		if (e.button === 0) {
			console.log("Left button pressed");
			leftMouse = true;
		} else if (e.button === 2) {
			console.log("Right button pressed");
			leftMouse = false;
		}

		isDragging = true;
		startX = e.offsetX;
		startY = e.offsetY;
	});

	canvas.addEventListener("contextmenu", function(e)  {
		e.preventDefault(); // disables the default right-click menu
	});


	canvas.addEventListener("wheel", function(e)  {
		e.preventDefault(); // prevents page scroll

		if (e.deltaY < 0) 
		{
			console.log("Scrolled up");
			// e.g., zoom in
			eyeZ += 0.1;
		} else {
			console.log("Scrolled down");
			// e.g., zoom out
			eyeZ -= 0.1;
		}
	});

	document.addEventListener("mousemove", function (e) {
		if (!isDragging) return;
		var currentX = e.offsetX;
		var currentY = e.offsetY;

		var deltaX = currentX - startX;
		var deltaY = currentY - startY;
		console.log('mouse drag by: ' + deltaX + ', ' + deltaY);

		// implement dragging logic
		if (leftMouse) {
			// left button: rotate
			modelY += deltaX;
			modelZ += deltaY;
		} else {
			// right button: pan
			eyeX -= deltaX * 0.01;
			eyeY += deltaY * 0.01;
		}
			
		startX = currentX;
		startY = currentY;
	});

	document.addEventListener("mouseup", function () {
		isDragging = false;
	});

	document.addEventListener("mouseleave", () => {
		isDragging = false;
	});
}

function initialize() 
{
	var canvas = document.querySelector("#glcanvas");
	canvas.width = canvas.clientWidth;
	canvas.height = canvas.clientHeight;

	gl = canvas.getContext("webgl2");

	// add mouse callbacks
	addMouseCallback(canvas);

	var vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSrc);
	var fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSrc);
	program = createProgram(gl, vertexShader, fragmentShader);

	// uniforms
	uniformModelViewLoc = gl.getUniformLocation(program, 'modelview');
	uniformProjectionLoc = gl.getUniformLocation(program, 'projection');
	uniformHeightScaleLoc = gl.getUniformLocation(program, 'heightScale');
	window.requestAnimationFrame(draw);
}

window.onload = initialize();