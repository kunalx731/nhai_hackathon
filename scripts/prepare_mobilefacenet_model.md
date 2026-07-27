# Preparing the MobileFaceNet TFLite Model

Place the final file at:

```
assets/models/mobilefacenet.tflite
```

---

## Option A — You already have a `.tflite` file

Copy it directly:

```bash
cp /path/to/MobileFaceNet.tflite assets/models/mobilefacenet.tflite
```

Then verify the model before integrating (see Sanity Check below).

---

## Option B — Convert from checkpoint (andrewpks repo)

```bash
git clone https://github.com/andrewpks/convert-tensorflow-mobilefacenet-model-to-tflite
cd convert-tensorflow-mobilefacenet-model-to-tflite

# Create a Python 3 environment compatible with TensorFlow 1.x
python3 -m venv venv
source venv/bin/activate

# TF 1.x is required by the conversion script
pip install tensorflow==1.15

# Follow the repo's README for any additional requirements, then:
python3 ckpt2tflite.py

# Copy the output:
cp output/ckpt_best/mobilefacenet_best_ckpt_evl/MobileFaceNet_iter_14000.tflite \
   /path/to/hackathon/assets/models/mobilefacenet.tflite
```

> Note: TensorFlow 1.15 requires Python ≤ 3.7. Use `pyenv` or a Docker container
> (`tensorflow/tensorflow:1.15.0-py3`) if your system Python is newer.

---

## Option C — Convert from Sirius pretrained model

Source: https://github.com/sirius-ai/MobileFaceNet_TF/tree/master/arch/pretrained_model

The Sirius repo provides checkpoint/frozen graph files, not a ready TFLite file.
You will need to:

1. Download the pretrained checkpoint.
2. Freeze the graph:
   ```python
   # TF 1.x
   from tensorflow.python.tools import freeze_graph
   freeze_graph.freeze_graph(...)
   ```
3. Convert to TFLite:
   ```python
   converter = tf.lite.TFLiteConverter.from_frozen_graph(
       'frozen_model.pb',
       input_arrays=['input'],     # confirm actual input node name
       output_arrays=['embeddings'] # confirm actual output node name
   )
   tflite_model = converter.convert()
   open('mobilefacenet.tflite', 'wb').write(tflite_model)
   ```
4. Verify input/output shapes before integrating into the app.

---

## Sanity Check (run after adding the model)

Open a Python shell with `tflite-runtime` or `tensorflow`:

```python
import tflite_runtime.interpreter as tflite

interpreter = tflite.Interpreter(model_path='assets/models/mobilefacenet.tflite')
interpreter.allocate_tensors()

input_details  = interpreter.get_input_details()
output_details = interpreter.get_output_details()

print('Input:', input_details)
print('Output:', output_details)
```

Confirm:
- Input shape:  `[1, 112, 112, 3]`  (NHWC)
- Output shape: `[1, N]` where N is the embedding dimension (128, 192, or 512)
- Update `MOBILEFACENET_EMBEDDING_SIZE` in `constants/model.ts` to match N.

---

## App integration checklist

After dropping in the `.tflite` file:

1. Install runtime:
   ```bash
   npm install react-native-fast-tflite
   npx pod-install          # iOS
   cd android && ./gradlew assembleDebug  # Android
   ```

2. Uncomment the real inference block in `services/mobileFaceNetService.ts`
   (search for `TODO: Uncomment when react-native-fast-tflite is installed`).

3. Confirm and fill in the preprocessing TODOs in `mobileFaceNetService.ts`:
   - Color order (RGB vs BGR)
   - Normalization range (`[0,1]`, `[-1,1]`, or mean/std)
   - Input tensor name / layout
   - Output tensor name / dimension
   - Whether output is already L2-normalized

4. Run a quick sanity inference and log:
   - Input tensor shape
   - Output tensor shape
   - Embedding length (must match `MOBILEFACENET_EMBEDDING_SIZE`)
   - Inference latency on device
   - Whether output values are finite
   - L2 norm of output after normalization (should be ≈ 1.0)
