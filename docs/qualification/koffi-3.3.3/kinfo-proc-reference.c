// C reference for the kinfo_proc layout; built with clang -arch arm64 and
// -arch x86_64 against the macOS 26.5 SDK, output in the .txt beside it.
#include <stdio.h>
#include <stddef.h>
#include <sys/sysctl.h>
#include <mach/mach_time.h>
int main(void) {
  printf("sizeof_kinfo_proc=%zu\n", sizeof(struct kinfo_proc));
  printf("p_starttime=%zu\n", offsetof(struct kinfo_proc, kp_proc.p_starttime));
  printf("p_pid=%zu\n", offsetof(struct kinfo_proc, kp_proc.p_pid));
  printf("e_ppid=%zu\n", offsetof(struct kinfo_proc, kp_eproc.e_ppid));
  printf("e_pgid=%zu\n", offsetof(struct kinfo_proc, kp_eproc.e_pgid));
  printf("sizeof_timeval=%zu\n", sizeof(struct timeval));
  printf("sizeof_timebase=%zu\n", sizeof(mach_timebase_info_data_t));
  printf("CTL_KERN=%d KERN_PROC=%d KERN_PROC_PID=%d KERN_PROC_ALL=%d ENOMEM=%d\n", CTL_KERN, KERN_PROC, KERN_PROC_PID, KERN_PROC_ALL, 12);
  return 0;
}
