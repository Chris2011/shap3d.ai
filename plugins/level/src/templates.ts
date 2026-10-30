import type { LevelFile, LevelFileObject } from './exporter';

/**
 * Engine templates: the level file as a script that builds the level's game objects inside the engine's editor –
 * next to the model's glTF, which brings the geometry (the objects' names are its nodes). Each template is one file
 * with the level's data in it. Godot and Unity take glTF's space (Y up); Unreal takes the model's own space (Z up),
 * turned into its left-handed centimetres.
 */

// i18n-ignore-start – the templates are code for the engines, in English like the level file
const safeName = (name: string) => name.replace(/[^\w-]+/g, '_') || 'level';

// ------------------------------------------------------------ Godot 4

/** a GDScript EditorScript (File › Run in Godot's script editor) */
export const godotTemplate = (file: LevelFile) => {
  // inside a """ string GDScript reads escapes – the JSON's own backslashes are doubled to stay as they are
  const data = JSON.stringify(file).replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"');
  return `@tool
extends EditorScript

# Level "${file.name}" from Shap3D.ai – builds its game objects in the open scene.
# 1. Import the model's glTF (.glb, exported with the level) into the scene: its nodes are the level's geometry.
# 2. Open this script in Godot's script editor and run it: File › Run (Ctrl+Shift+X).
# Every object gets the metadata level_id, kind, props and actions (Node › Metadata in the inspector).

const DATA := """${data}"""


func _run() -> void:
	var scene := get_scene()
	if scene == null:
		push_error("Open a 3D scene first.")
		return
	var data: Dictionary = JSON.parse_string(DATA)
	var level := Node3D.new()
	level.name = "Level " + str(data["name"])
	scene.add_child(level)
	level.owner = scene
	for object in data["objects"]:
		var node := _make(object)
		node.name = str(object["name"]) if str(object["name"]) != "" else str(object["id"])
		level.add_child(node)
		_own(node, scene)
		node.position = _vector(object["position"])
		var q: Array = object["rotation"]
		node.quaternion = Quaternion(q[0], q[1], q[2], q[3])
		if object.has("look"):
			var look := _vector(object["look"])
			var up := Vector3.UP if absf(look.y) < 0.99 else Vector3.FORWARD
			node.look_at(node.global_position + look, up)
		node.set_meta("level_id", object["id"])
		node.set_meta("kind", object["kind"])
		node.set_meta("props", object["props"])
		node.set_meta("actions", object.get("actions", []))
	_atmosphere(data["atmosphere"], level, scene)
	print("Level %s: %d objects" % [data["name"], data["objects"].size()])


func _make(object: Dictionary) -> Node3D:
	var props: Dictionary = object["props"]
	var size: Array = object["size"]
	match str(object["kind"]):
		"trigger", "hazard", "soundzone", "teleporter", "jumppad":
			return _area(size)
		"pickup", "savepoint":
			return _area([1.0, 1.0, 1.0])
		"camera":
			var camera := Camera3D.new()
			camera.fov = float(props.get("fov", 50))
			camera.current = bool(props.get("start", false))
			return camera
		"light":
			if str(props.get("type", "point")) == "spot":
				var spot := SpotLight3D.new()
				spot.spot_range = float(props.get("range", 8))
				spot.spot_angle = float(props.get("angle", 35))
				_light(spot, props)
				return spot
			var omni := OmniLight3D.new()
			omni.omni_range = float(props.get("range", 8))
			_light(omni, props)
			return omni
		_:
			# spawn points, enemies, waypoints, doors: a marker where they are (doors are in the glTF)
			return Marker3D.new()


func _area(size: Array) -> Area3D:
	# the volume's box along the object's own axes: width, depth, height – standing on its origin
	var area := Area3D.new()
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(size[0], size[1], size[2])
	shape.shape = box
	shape.position = Vector3(0, 0, float(size[2]) / 2.0)
	area.add_child(shape)
	return area


func _light(light: Light3D, props: Dictionary) -> void:
	light.light_color = Color(str(props.get("color", "#ffffff")))
	light.light_energy = float(props.get("intensity", 1))
	light.visible = bool(props.get("on", true))
	light.shadow_enabled = bool(props.get("shadows", false))


func _atmosphere(atmosphere: Dictionary, level: Node3D, scene: Node) -> void:
	var environment := Environment.new()
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_energy = float(atmosphere.get("daylight", 1))
	if bool(atmosphere.get("fog", false)):
		environment.fog_enabled = true
		environment.fog_light_color = Color(str(atmosphere.get("fogColor", "#9aa3ab")))
		environment.fog_density = 3.0 / maxf(1.0, float(atmosphere.get("fogFar", 30)))
	var world := WorldEnvironment.new()
	world.name = "Atmosphere"
	world.environment = environment
	level.add_child(world)
	world.owner = scene


func _vector(values: Array) -> Vector3:
	return Vector3(values[0], values[1], values[2])


func _own(node: Node, owner: Node) -> void:
	node.owner = owner
	for child in node.get_children():
		_own(child, owner)
`;
};

// ------------------------------------------------------------ Unity

const csString = (value: string) => `@"${value.replace(/"/g, '""')}"`;
const csFloat = (value: number) => `${Number.isFinite(value) ? value : 0}f`;

/**
 * glTF's space (right-handed, Y up) in Unity's (left-handed, Y up) the way glTFast imports glTF: X mirrored – a
 * position (−x, y, z), a turn (x, −y, −z, w)
 */
const unityVector = ([x, y, z]: number[]) => `new Vector3(${csFloat(-x)}, ${csFloat(y)}, ${csFloat(z)})`;
const unityQuaternion = ([x, y, z, w]: number[]) => `new Quaternion(${csFloat(x)}, ${csFloat(-y)}, ${csFloat(-z)}, ${csFloat(w)})`;

const unityLine = (object: LevelFileObject) =>
  `        Make(level, ${csString(object.id)}, ${csString(object.kind)}, ${csString(object.name || object.id)}, ${unityVector(object.position)}, ${unityQuaternion(object.rotation)}, new Vector3(${object.size.map(csFloat).join(', ')}), ${object.look ? unityVector(object.look) : 'Vector3.zero'}, ${csString(JSON.stringify(object.props))}, ${csString(JSON.stringify(object.actions ?? []))});`;

/** a C# file: the level object component and an editor menu that builds the level (Tools › Shap3D) */
export const unityTemplate = (file: LevelFile) => {
  const { atmosphere } = file;
  return `// Shap3dLevelObject.cs – level "${file.name}" from Shap3D.ai.
// 1. Put this file into the project's Assets folder (the file name must stay Shap3dLevelObject.cs).
// 2. Import the model's glTF (.glb, exported with the level) with glTFast and put it into the scene.
// 3. Tools › Shap3D › Import level "${file.name}" builds the level's game objects (one undo step).
// Places follow glTFast's conversion (X mirrored); every object carries its id, kind, props and actions (JSON).
using UnityEngine;
#if UNITY_EDITOR
using UnityEditor;
#endif

/// <summary>A game object of a Shap3D.ai level.</summary>
public class Shap3dLevelObject : MonoBehaviour
{
    public string levelId;
    public string kind;
    [TextArea] public string props;
    [TextArea] public string actions;
}

#if UNITY_EDITOR
public static class Shap3dLevelImporter
{
    [MenuItem("Tools/Shap3D/Import level \\"${file.name.replace(/"/g, '')}\\"")]
    static void Import()
    {
        var level = new GameObject(${csString(`Level ${file.name}`)});
        Undo.RegisterCreatedObjectUndo(level, "Import level");
${file.objects.map(unityLine).join('\n')}
        RenderSettings.ambientIntensity = ${csFloat(atmosphere.daylight)};
        RenderSettings.fog = ${atmosphere.fog ? 'true' : 'false'};
        RenderSettings.fogMode = FogMode.Linear;
        RenderSettings.fogStartDistance = ${csFloat(atmosphere.fogNear)};
        RenderSettings.fogEndDistance = ${csFloat(atmosphere.fogFar)};
        if (ColorUtility.TryParseHtmlString(${csString(atmosphere.fogColor)}, out var fogColor)) RenderSettings.fogColor = fogColor;
        Selection.activeGameObject = level;
    }

    static void Make(GameObject level, string id, string kind, string name, Vector3 position, Quaternion rotation, Vector3 size, Vector3 look, string props, string actions)
    {
        var item = new GameObject(name);
        item.transform.SetParent(level.transform, false);
        item.transform.localPosition = position;
        item.transform.localRotation = look == Vector3.zero ? rotation : Quaternion.LookRotation(look);
        var data = item.AddComponent<Shap3dLevelObject>();
        data.levelId = id;
        data.kind = kind;
        data.props = props;
        data.actions = actions;
        switch (kind)
        {
            case "trigger":
            case "hazard":
            case "soundzone":
            case "teleporter":
            case "jumppad":
            case "pickup":
            case "savepoint":
            {
                // the volume along the object's own axes (width, depth, height), standing on its origin
                var box = item.AddComponent<BoxCollider>();
                box.isTrigger = true;
                box.size = kind == "pickup" || kind == "savepoint" ? Vector3.one : size;
                box.center = new Vector3(0f, 0f, box.size.z / 2f);
                break;
            }
            case "light":
            {
                var light = item.AddComponent<Light>();
                light.type = props.Contains("\\"type\\":\\"spot\\"") ? LightType.Spot : LightType.Point;
                light.range = Number(props, "range", 8f);
                light.intensity = Number(props, "intensity", 1f);
                light.spotAngle = Number(props, "angle", 35f) * 2f;
                if (ColorUtility.TryParseHtmlString(Text(props, "color"), out var color)) light.color = color;
                light.shadows = props.Contains("\\"shadows\\":true") ? LightShadows.Soft : LightShadows.None;
                item.SetActive(!props.Contains("\\"on\\":false"));
                break;
            }
            case "camera":
            {
                var camera = item.AddComponent<Camera>();
                camera.fieldOfView = Number(props, "fov", 50f);
                camera.enabled = props.Contains("\\"start\\":true");
                break;
            }
        }
    }

    // reading one value out of the props JSON (Unity has no JSON object parser built in)
    static float Number(string json, string key, float fallback)
    {
        var text = Text(json, key);
        return float.TryParse(text, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var value) ? value : fallback;
    }

    static string Text(string json, string key)
    {
        var at = json.IndexOf("\\"" + key + "\\":");
        if (at < 0) return "";
        var start = at + key.Length + 3;
        if (start < json.Length && json[start] == '"')
        {
            var end = json.IndexOf('"', start + 1);
            return end > start ? json.Substring(start + 1, end - start - 1) : "";
        }
        var stop = json.IndexOfAny(new[] { ',', '}' }, start);
        return stop > start ? json.Substring(start, stop - start) : "";
    }
}
#endif
`;
};

// ------------------------------------------------------------ Unreal

/** a Python script for Unreal's editor (Tools › Execute Python Script, Python Editor Script Plugin on) */
export const unrealTemplate = (file: LevelFile) => {
  // no ' in the raw string: JSON may write it as an escape
  const data = JSON.stringify(file).replace(/'/g, '\\u0027');
  return `# Level "${file.name}" from Shap3D.ai – builds its game objects in the open Unreal level.
# 1. Import the model's glTF (.glb, exported with the level) and place it at the origin.
# 2. Tools › Execute Python Script… and choose this file (the Python Editor Script Plugin has to be on).
# Places come from the model's own space (metres, Z up) turned into Unreal's centimetres (Y mirrored).
# Every actor gets the tags level:<id>, kind:<kind>, prop:<name>=<value> and action:<do>:<target>:<value>.
import json

import unreal

DATA = json.loads(r'''${data}''')

actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)


def location(obj, lift=0.0):
    x, y, z = obj["model"]["position"]
    return unreal.Vector(x * 100.0, -y * 100.0, (z + lift) * 100.0)


def rotation(obj):
    # the model turns counter-clockwise around Z; Unreal's Y is mirrored, so its yaw turns the other way
    return unreal.Rotator(roll=0.0, pitch=obj["model"].get("pitch", 0.0), yaw=-obj["model"]["yaw"])


def colour(text):
    text = text.lstrip("#")
    r, g, b = (int(text[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    return unreal.LinearColor(r, g, b, 1.0)


def make(obj):
    kind = obj["kind"]
    props = obj["props"]
    w, d, h = obj["size"]
    if kind == "spawn":
        actor = actors.spawn_actor_from_class(unreal.PlayerStart, location(obj, 0.9), rotation(obj))
    elif kind in ("trigger", "hazard", "soundzone", "teleporter", "jumppad"):
        # a trigger box is 64 cm wide at scale 1 – scaled to the volume, its middle half its height up
        actor = actors.spawn_actor_from_class(unreal.TriggerBox, location(obj, h / 2.0), rotation(obj))
        actor.set_actor_scale3d(unreal.Vector(w * 100.0 / 64.0, d * 100.0 / 64.0, h * 100.0 / 64.0))
    elif kind == "light":
        spot = props.get("type") == "spot"
        actor = actors.spawn_actor_from_class(unreal.SpotLight if spot else unreal.PointLight, location(obj), rotation(obj))
        light = actor.get_component_by_class(unreal.SpotLightComponent if spot else unreal.PointLightComponent)
        light.set_intensity(float(props.get("intensity", 1)) * 5000.0)
        light.set_attenuation_radius(float(props.get("range", 8)) * 100.0)
        light.set_light_color(colour(str(props.get("color", "#ffffff"))))
        light.set_visibility(bool(props.get("on", True)))
        light.set_cast_shadows(bool(props.get("shadows", False)))
        if spot:
            light.set_outer_cone_angle(float(props.get("angle", 35)))
    elif kind == "camera":
        actor = actors.spawn_actor_from_class(unreal.CameraActor, location(obj), rotation(obj))
        actor.get_component_by_class(unreal.CameraComponent).set_field_of_view(float(props.get("fov", 50)))
    else:
        actor = actors.spawn_actor_from_class(unreal.TargetPoint, location(obj), rotation(obj))
    actor.set_actor_label(obj["name"] or obj["id"])
    tags = ["level:" + obj["id"], "kind:" + kind]
    tags += ["prop:%s=%s" % (name, value) for name, value in props.items()]
    tags += ["action:%s:%s:%s" % (a["do"], a.get("target", ""), a.get("value", "")) for a in obj.get("actions", [])]
    actor.set_editor_property("tags", [unreal.Name(tag) for tag in tags])
    actor.set_folder_path("Level %s" % DATA["name"])


with unreal.ScopedEditorTransaction("Import level %s" % DATA["name"]):
    for item in DATA["objects"]:
        make(item)
    atmosphere = DATA["atmosphere"]
    if atmosphere.get("fog"):
        fog = actors.spawn_actor_from_class(unreal.ExponentialHeightFog, unreal.Vector(0, 0, 0), unreal.Rotator())
        component = fog.get_component_by_class(unreal.ExponentialHeightFogComponent)
        component.set_fog_density(3.0 / max(1.0, float(atmosphere.get("fogFar", 30))) * 0.1)
        component.set_fog_inscattering_color(colour(atmosphere.get("fogColor", "#9aa3ab")))
        fog.set_folder_path("Level %s" % DATA["name"])

unreal.log("Level %s: %d objects" % (DATA["name"], len(DATA["objects"])))
`;
};

// i18n-ignore-end

export const TEMPLATES = [
  {
    id: 'godot',
    label: 'level.export.godot',
    extension: 'gd',
    make: godotTemplate,
    fileName: (name: string) => `${safeName(name)}_level.gd`,
  },
  { id: 'unity', label: 'level.export.unity', extension: 'cs', make: unityTemplate, fileName: () => 'Shap3dLevelObject.cs' },
  {
    id: 'unreal',
    label: 'level.export.unreal',
    extension: 'py',
    make: unrealTemplate,
    fileName: (name: string) => `${safeName(name)}_level.py`,
  },
];
