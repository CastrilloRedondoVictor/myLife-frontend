import Swal from 'sweetalert2';

const baseOptions = {
  buttonsStyling: false,
  customClass: {
    popup: 'mylife-swal-popup',
    title: 'mylife-swal-title',
    htmlContainer: 'mylife-swal-message',
    confirmButton: 'button button-primary mylife-swal-confirm',
    cancelButton: 'button button-soft mylife-swal-cancel',
  },
};

export function showSuccess(message: string) {
  void Swal.fire({
    ...baseOptions,
    toast: true,
    position: 'top-end',
    icon: 'success',
    title: message,
    showConfirmButton: false,
    timer: 2800,
    timerProgressBar: true,
  });
}

export function showError(message: string) {
  void Swal.fire({
    ...baseOptions,
    icon: 'error',
    title: 'No se pudo completar',
    text: message,
    confirmButtonText: 'Entendido',
  });
}

export function showInfo(title: string, text: string) {
  void Swal.fire({ ...baseOptions, icon: 'info', title, text, confirmButtonText: 'Entendido' });
}

export async function confirmAction(title: string, text: string, confirmButtonText = 'Eliminar') {
  const result = await Swal.fire({
    ...baseOptions,
    icon: 'warning',
    title,
    text,
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText: 'Cancelar',
    reverseButtons: true,
    focusCancel: true,
  });
  return result.isConfirmed;
}
