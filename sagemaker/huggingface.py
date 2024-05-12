from constructs import Construct
from cdklabs.generative_ai_cdk_constructs import (
    HuggingFaceSageMakerEndpoint,
    DeepLearningContainerImage,
    SageMakerInstanceType,
)

HuggingFaceSageMakerEndpoint(
    self,
    'Mistral',
    model_id='mistralai/Mistral-7B-Instruct-v0.1',
    instance_type=SageMakerInstanceType.ML_G5_2_XLARGE,
    container=DeepLearningContainerImage.HUGGINGFACE_PYTORCH_TGI_INFERENCE_2_0_1_TGI1_1_0_GPU_PY39_CU118_UBUNTU20_04,
    environment={
        'SM_NUM_GPUS': '1',
        'MAX_INPUT_LENGTH': '2048',
        'MAX_TOTAL_TOKENS': '4096',
    },
)